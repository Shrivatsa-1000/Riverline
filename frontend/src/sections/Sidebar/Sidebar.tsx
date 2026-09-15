import { BrandHeader } from '../../components/BrandHeader/BrandHeader';
import { ChatPanel } from '../../components/ChatPanel/ChatPanel';
import { VoicePanel } from '../../components/VoicePanel/VoicePanel';
import type { ChatItem } from '../../types/dashboard';
import type { VoiceSessionResponse } from '../../types/voice';
import './Sidebar.css';

interface SidebarProps {
  chatItems: ChatItem[];
  userName: string;
  chatStatus: string;
  isSendingMessage: boolean;
  isAgentSpeaking: boolean;
  lastAgentReplyText: string;
  onInterruptAgent: () => boolean;
  onSendMessage: (text: string) => Promise<void>;
  voiceSession: VoiceSessionResponse | null;
  voiceSessionStatus: string;
  onVoiceTranscript: (text: string) => Promise<void>;
  externalVoiceLevel?: number | null;
}

export function Sidebar({
  chatItems,
  userName,
  chatStatus,
  isSendingMessage,
  isAgentSpeaking,
  lastAgentReplyText,
  onInterruptAgent,
  onSendMessage,
  voiceSession,
  voiceSessionStatus,
  onVoiceTranscript,
  externalVoiceLevel = null
}: SidebarProps) {
  return (
    <aside className="sidebar">
      <BrandHeader />
      <VoicePanel
        externalVoiceLevel={externalVoiceLevel}
        voiceSession={voiceSession}
        voiceSessionStatus={voiceSessionStatus}
        isSendingMessage={isSendingMessage}
        isAgentSpeaking={isAgentSpeaking}
        lastAgentReplyText={lastAgentReplyText}
        onInterruptAgent={onInterruptAgent}
        onVoiceTranscript={onVoiceTranscript}
      />
      <ChatPanel
        chatItems={chatItems}
        userName={userName}
        chatStatus={chatStatus}
        isSending={isSendingMessage}
        onSendMessage={onSendMessage}
      />
    </aside>
  );
}
