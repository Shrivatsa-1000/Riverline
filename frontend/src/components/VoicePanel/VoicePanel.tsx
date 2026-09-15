import { Mic, PhoneOff } from 'lucide-react';
import { VoiceWave } from '../VoiceWave/VoiceWave';
import { useMicVolume } from '../../hooks/useMicVolume';
import type { VoiceSessionResponse } from '../../types/voice';
import { useVoicePanelController } from './useVoicePanelController';
import './VoicePanel.css';

interface VoicePanelProps {
  externalVoiceLevel?: number | null;
  voiceSession: VoiceSessionResponse | null;
  voiceSessionStatus: string;
  isSendingMessage: boolean;
  isAgentSpeaking: boolean;
  lastAgentReplyText: string;
  onInterruptAgent: () => boolean;
  onVoiceTranscript: (text: string) => Promise<void>;
}

function clamp(value: number) {
  return Math.min(1, Math.max(0, value));
}

function formatTime(unixTime: number) {
  const value = new Date(unixTime * 1000);
  return value.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function getMicStatusText(isActive: boolean, level: number, error: string | null) {
  if (error) {
    return error;
  }

  if (isActive && level > 0.05) {
    return 'Voice detected';
  }

  if (isActive) {
    return 'Listening...';
  }

  return 'Tap to speak or start a conversation';
}

function getPrimaryButtonLabel(isSendingMessage: boolean, isAgentSpeaking: boolean, isVoiceActive: boolean) {
  if (isSendingMessage) {
    return isAgentSpeaking ? 'Interrupt & speak' : 'Processing...';
  }

  if (isVoiceActive) {
    return 'Listening...';
  }

  return 'Tap to speak';
}

export function VoicePanel({
  externalVoiceLevel = null,
  voiceSession,
  voiceSessionStatus,
  isSendingMessage,
  isAgentSpeaking,
  lastAgentReplyText,
  onInterruptAgent,
  onVoiceTranscript
}: VoicePanelProps) {
  const { error, isListening, level, startListening, stopListening } = useMicVolume();

  const hasExternalLevel = Number.isFinite(externalVoiceLevel);
  const externalLevel = hasExternalLevel ? Number(externalVoiceLevel) : null;
  const visibleLevel = hasExternalLevel && externalLevel !== null ? clamp(externalLevel) : level;

  const { isRecognizing, speechStatus, startVoiceCapture, stopVoiceCapture } = useVoicePanelController({
    hasExternalLevel,
    isListening,
    isSendingMessage,
    isAgentSpeaking,
    lastAgentReplyText,
    onInterruptAgent,
    onVoiceTranscript,
    startListening,
    stopListening
  });

  const isVoiceActive = hasExternalLevel || isListening || isRecognizing;
  const micStatusText = getMicStatusText(isVoiceActive, visibleLevel, error);

  const roomName = voiceSession ? voiceSession.room.name : 'Not ready yet';
  const tokenExpiryText = voiceSession ? formatTime(voiceSession.tokenExpiresAtUnix) : '--';

  const primaryButtonDisabled =
    (isVoiceActive && !isAgentSpeaking) || hasExternalLevel || (isSendingMessage && !isAgentSpeaking);

  const primaryButtonLabel = getPrimaryButtonLabel(isSendingMessage, isAgentSpeaking, isVoiceActive);

  return (
    <section className="panel voice-panel">
      <h2>Voice agent ready</h2>
      <p>{voiceSessionStatus}</p>
      <p className="voice-panel__subtext">Room: {roomName}</p>
      <p className="voice-panel__subtext">Token valid till: {tokenExpiryText}</p>
      <p className="voice-panel__subtext">Mic status: {micStatusText}</p>
      <p className="voice-panel__subtext">Speech status: {speechStatus}</p>

      <VoiceWave isActive={isVoiceActive} level={visibleLevel} />

      <div className="voice-actions">
        <button
          className="voice-btn voice-btn--primary"
          disabled={primaryButtonDisabled}
          onClick={() => {
            void startVoiceCapture();
          }}
          type="button"
        >
          <Mic size={16} />
          {primaryButtonLabel}
        </button>

        <button className="voice-btn voice-btn--danger" disabled={!isVoiceActive} onClick={stopVoiceCapture} type="button">
          <PhoneOff size={16} />
          End call
        </button>
      </div>
    </section>
  );
}
