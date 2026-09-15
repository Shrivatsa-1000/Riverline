import { useEffect, useRef, useState } from 'react';
import { fetchStepperConfig } from './api/stepperApi';
import { openAgentSession, requestAgentReply } from './api/agentApi';
import { appendChatMessage, createChat, listChatMessages, type ChatMessage } from './api/chatApi';
import { emptyDashboardData, fetchDashboardData } from './api/financialStateApi';
import { createOrRefreshVoiceSession } from './api/voiceApi';
import { useAgentAudioPlayer, type AudioPlayFailureReason } from './hooks/useAgentAudioPlayer';
import { Sidebar } from './sections/Sidebar/Sidebar';
import { DashboardMain } from './sections/DashboardMain/DashboardMain';
import type { ChatItem, DashboardData, StepperConfig } from './types/dashboard';
import type { VoiceSessionResponse } from './types/voice';
import './App.css';

const DEFAULT_USER_NAME = 'Ankit';
const AGENT_NAME = 'Paisa';

const emptyStepperConfig: StepperConfig = {
  steps: []
};

function formatChatTime(isoTime: string) {
  const value = new Date(isoTime);
  return value.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function mapMessageToChatItem(message: ChatMessage): ChatItem {
  return {
    id: message.id,
    at: formatChatTime(message.createdAt),
    text: message.content,
    senderRole: message.senderRole,
    senderName: message.senderName
  };
}

function getAudioFailureStatus(reason?: AudioPlayFailureReason) {
  if (reason === 'missing-audio') {
    return 'Agent replied without audio. Check backend voice model settings.';
  }

  if (reason === 'invalid-audio') {
    return 'Agent audio unavailable in this browser.';
  }

  if (reason === 'playback-blocked') {
    return 'Audio playback blocked by browser. Click anywhere and try again.';
  }

  if (reason === 'playback-error') {
    return 'Agent audio playback failed. Please try again.';
  }

  return 'Audio playback failed. Please try again.';
}

function createLocalFallbackMessage(text: string): ChatItem {
  return {
    id: `local-fallback-${Date.now()}`,
    at: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    text,
    senderRole: 'agent',
    senderName: AGENT_NAME
  };
}

export default function App() {
  const [name, setName] = useState(DEFAULT_USER_NAME);
  const [stepperConfig, setStepperConfig] = useState<StepperConfig>(emptyStepperConfig);
  const [dashboardData, setDashboardData] = useState<DashboardData>(emptyDashboardData);

  const [chatId, setChatId] = useState<string | null>(null);
  const [chatItems, setChatItems] = useState<ChatItem[]>([]);
  const [chatStatus, setChatStatus] = useState('Preparing chat...');
  const [isSendingMessage, setIsSendingMessage] = useState(false);
  const [lastAgentReplyText, setLastAgentReplyText] = useState('');

  const [voiceSession, setVoiceSession] = useState<VoiceSessionResponse | null>(null);
  const [voiceSessionStatus, setVoiceSessionStatus] = useState('Preparing voice session...');

  const { isPlaying: isAgentSpeaking, play: playAgentAudio, stop: stopAgentAudio } = useAgentAudioPlayer();

  const activeSendTokenRef = useRef<number | null>(null);
  const nextSendTokenRef = useRef(1);
  const hasStartedVoiceConversationRef = useRef(false);

  const beginSending = () => {
    const token = nextSendTokenRef.current;
    nextSendTokenRef.current += 1;
    activeSendTokenRef.current = token;
    setIsSendingMessage(true);
    return token;
  };

  const endSending = (token: number) => {
    if (activeSendTokenRef.current !== token) {
      return;
    }

    activeSendTokenRef.current = null;
    setIsSendingMessage(false);
  };

  const forceEndSending = () => {
    activeSendTokenRef.current = null;
    setIsSendingMessage(false);
  };

  const interruptAgentSpeech = () => {
    if (!isAgentSpeaking) {
      return false;
    }

    stopAgentAudio();
    forceEndSending();
    setChatStatus('Agent interrupted. Listening...');

    return true;
  };

  const refreshFinanceUi = async (userName: string) => {
    const [stepper, dashboard] = await Promise.all([
      fetchStepperConfig(userName),
      fetchDashboardData(userName)
    ]);

    setStepperConfig(stepper);
    setDashboardData(dashboard);
  };

  useEffect(() => {
    let alive = true;

    const safeName = name.trim() || DEFAULT_USER_NAME;

    Promise.all([fetchStepperConfig(safeName), fetchDashboardData(safeName)])
      .then(([stepper, dashboard]) => {
        if (!alive) {
          return;
        }

        setStepperConfig(stepper);
        setDashboardData(dashboard);
      })
      .catch(() => {
        if (!alive) {
          return;
        }

        setStepperConfig(emptyStepperConfig);
        setDashboardData(emptyDashboardData);
      });

    return () => {
      alive = false;
    };
  }, [name]);

  useEffect(() => {
    let alive = true;

    const safeName = name.trim();

    if (!safeName) {
      return () => {
        alive = false;
      };
    }

    const loadChat = async () => {
      stopAgentAudio();
      forceEndSending();
      hasStartedVoiceConversationRef.current = false;
      setChatStatus('Loading chat history...');
      setChatItems([]);
      setChatId(null);
      setLastAgentReplyText('');

      try {
        const session = await createChat(safeName, {
          reuseLatest: true,
          historyLimit: 500
        });

        if (!alive) {
          return;
        }

        setChatId(session.chat.id);

        const historyMessages =
          session.messages.length > 0
            ? session.messages
            : await listChatMessages({
                chatId: session.chat.id,
                limit: 200
              });

        if (!alive) {
          return;
        }

        setChatItems(historyMessages.map(mapMessageToChatItem));

        const latestAgentMessage = [...historyMessages]
          .reverse()
          .find((message) => message.senderRole === 'agent');

        setLastAgentReplyText(latestAgentMessage?.content || '');

        if (historyMessages.length > 0) {
          setChatStatus(`Loaded ${historyMessages.length} previous messages`);
          return;
        }

        setChatStatus(session.reusedChat ? 'Previous chat found. Ready to continue.' : 'Chat ready');
      } catch (error: unknown) {
        if (!alive) {
          return;
        }

        const message = error instanceof Error ? error.message : 'Unable to create chat';
        setChatStatus(message);
      }
    };

    void loadChat();

    return () => {
      alive = false;
    };
  }, [name, stopAgentAudio]);

  useEffect(() => {
    let alive = true;

    const safeName = name.trim();

    if (!safeName) {
      return () => {
        alive = false;
      };
    }

    const loadVoiceSession = async () => {
      setVoiceSessionStatus('Checking private room...');

      try {
        const session = await createOrRefreshVoiceSession(safeName);

        if (!alive) {
          return;
        }

        setVoiceSession(session);
        setVoiceSessionStatus(
          session.reusedRoom ? 'Private room found. Tokens refreshed.' : 'New private room created.'
        );
      } catch (error: unknown) {
        if (!alive) {
          return;
        }

        setVoiceSession(null);
        const message = error instanceof Error ? error.message : 'Voice session unavailable';
        setVoiceSessionStatus(message);
      }
    };

    void loadVoiceSession();

    return () => {
      alive = false;
    };
  }, [name]);

  const appendAgentMessageAndPlayAudio = async (
    currentChatId: string,
    agentText: string,
    audioBase64?: string,
    audioMimeType?: string
  ) => {
    setLastAgentReplyText(agentText);

    const savedAgentMessage = await appendChatMessage({
      chatId: currentChatId,
      senderRole: 'agent',
      senderName: AGENT_NAME,
      content: agentText
    });

    setChatItems((previous) => [...previous, mapMessageToChatItem(savedAgentMessage)]);
    setChatStatus('Chat ready');

    const audioResult = await playAgentAudio(audioBase64, audioMimeType);

    if (!audioResult.ok) {
      setChatStatus(getAudioFailureStatus(audioResult.reason));
    }
  };

  const sendMessage = async (text: string, source: 'voice' | 'chat' | 'manual' = 'chat') => {
    const currentChatId = chatId;
    const safeText = text.trim();
    const safeName = name.trim() || DEFAULT_USER_NAME;

    if (!safeText || !currentChatId || activeSendTokenRef.current !== null) {
      if (!currentChatId) {
        setChatStatus('Chat is still preparing. Please try again.');
      }

      return;
    }

    const sendToken = beginSending();

    try {
      setChatStatus('Saving your message...');

      const savedUserMessage = await appendChatMessage({
        chatId: currentChatId,
        senderRole: 'user',
        senderName: safeName,
        content: safeText
      });

      setChatItems((previous) => [...previous, mapMessageToChatItem(savedUserMessage)]);
      setChatStatus(`${AGENT_NAME} is replying...`);

      const agentResponse = await requestAgentReply({
        message: safeText,
        userName: safeName,
        source,
        conversationId: currentChatId
      });

      await appendAgentMessageAndPlayAudio(
        currentChatId,
        agentResponse.reply,
        agentResponse.audioBase64,
        agentResponse.audioMimeType
      );

      await refreshFinanceUi(safeName);
    } catch (unknownError) {
      const fallbackText =
        unknownError instanceof Error
          ? `I could not complete that request: ${unknownError.message}`
          : 'I could not complete that request right now.';

      setLastAgentReplyText(fallbackText);
      setChatStatus(fallbackText);

      try {
        const fallbackMessage = await appendChatMessage({
          chatId: currentChatId,
          senderRole: 'agent',
          senderName: AGENT_NAME,
          content: fallbackText
        });

        setChatItems((previous) => [...previous, mapMessageToChatItem(fallbackMessage)]);
      } catch {
        setChatItems((previous) => [...previous, createLocalFallbackMessage(fallbackText)]);
      }
    } finally {
      endSending(sendToken);
    }
  };

  const startVoiceConversation = async () => {
    const currentChatId = chatId;
    const safeName = name.trim() || DEFAULT_USER_NAME;

    if (!currentChatId || hasStartedVoiceConversationRef.current) {
      return;
    }

    const sendToken = beginSending();
    hasStartedVoiceConversationRef.current = true;

    try {
      stopAgentAudio();
      setChatStatus(`${AGENT_NAME} is joining...`);

      const response = await openAgentSession({
        userName: safeName,
        conversationId: currentChatId
      });

      await appendAgentMessageAndPlayAudio(
        currentChatId,
        response.reply,
        response.audioBase64,
        response.audioMimeType
      );

      await refreshFinanceUi(safeName);
    } catch (error: unknown) {
      hasStartedVoiceConversationRef.current = false;

      const message = error instanceof Error ? error.message : 'Unable to start voice conversation';
      setChatStatus(message);
    } finally {
      endSending(sendToken);
    }
  };

  return (
    <div className="app-layout">
      <Sidebar
        chatItems={chatItems}
        userName={name}
        chatStatus={chatStatus}
        isSendingMessage={isSendingMessage}
        isAgentSpeaking={isAgentSpeaking}
        lastAgentReplyText={lastAgentReplyText}
        onInterruptAgent={interruptAgentSpeech}
        onSendMessage={async (text) => sendMessage(text, 'chat')}
        onStartVoiceConversation={startVoiceConversation}
        voiceSession={voiceSession}
        voiceSessionStatus={voiceSessionStatus}
        onVoiceTranscript={async (text) => sendMessage(text, 'voice')}
      />
      <DashboardMain name={name} onNameChange={setName} steps={stepperConfig.steps} data={dashboardData} />
    </div>
  );
}
