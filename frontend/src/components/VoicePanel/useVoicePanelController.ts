import { useEffect, useRef, useState } from 'react';
import { useBargeInMonitor } from './useBargeInMonitor';
import { useMainVoiceCapture } from './useMainVoiceCapture';

interface UseVoicePanelControllerInput {
  hasExternalLevel: boolean;
  isListening: boolean;
  isSendingMessage: boolean;
  isAgentSpeaking: boolean;
  lastAgentReplyText: string;
  onInterruptAgent: () => boolean;
  onVoiceTranscript: (text: string) => Promise<void>;
  startListening: () => Promise<void>;
  stopListening: () => void;
}

interface UseVoicePanelControllerResult {
  isRecognizing: boolean;
  speechStatus: string;
  startVoiceCapture: () => Promise<void>;
  stopVoiceCapture: () => void;
}

export function useVoicePanelController({
  hasExternalLevel,
  isListening,
  isSendingMessage,
  isAgentSpeaking,
  lastAgentReplyText,
  onInterruptAgent,
  onVoiceTranscript,
  startListening,
  stopListening
}: UseVoicePanelControllerInput): UseVoicePanelControllerResult {
  const [isRecognizing, setIsRecognizing] = useState(false);
  const [speechStatus, setSpeechStatus] = useState('Ready');

  const shouldKeepRecognitionRef = useRef(false);
  const isSendingMessageRef = useRef(isSendingMessage);
  const isProcessingTranscriptRef = useRef(false);
  const isPausedForReplyRef = useRef(false);

  const submitTranscript = (transcript: string, statusBeforeSend: string) => {
    isProcessingTranscriptRef.current = true;
    setSpeechStatus(statusBeforeSend);

    void onVoiceTranscript(transcript)
      .then(() => {
        setSpeechStatus('Listening for next message...');
      })
      .catch((unknownError) => {
        const message = unknownError instanceof Error ? unknownError.message : 'Voice message failed.';
        setSpeechStatus(message);
      })
      .finally(() => {
        isProcessingTranscriptRef.current = false;
      });
  };

  const handlePermissionDenied = () => {
    setSpeechStatus('Microphone permission denied.');
    shouldKeepRecognitionRef.current = false;
    isPausedForReplyRef.current = false;
    isProcessingTranscriptRef.current = false;
    setIsRecognizing(false);
    stopListening();
  };

  const { startBargeInMonitor, stopBargeInMonitor } = useBargeInMonitor({
    shouldKeepRecognitionRef,
    isPausedForReplyRef,
    isProcessingTranscriptRef,
    isAgentSpeaking,
    lastAgentReplyText,
    onInterruptAgent,
    onTranscriptAccepted: submitTranscript,
    onPermissionDenied: handlePermissionDenied,
    setSpeechStatus
  });

  const { startVoiceCapture, stopVoiceCapture, pauseCaptureForReply } = useMainVoiceCapture({
    hasExternalLevel,
    isListening,
    isRecognizing,
    isSendingMessage,
    isAgentSpeaking,
    lastAgentReplyText,
    onInterruptAgent,
    onTranscriptAccepted: submitTranscript,
    onPermissionDenied: handlePermissionDenied,
    setIsRecognizing,
    setSpeechStatus,
    startListening,
    stopListening,
    shouldKeepRecognitionRef,
    isSendingMessageRef,
    isProcessingTranscriptRef,
    isPausedForReplyRef,
    stopBargeInMonitor
  });

  useEffect(() => {
    isSendingMessageRef.current = isSendingMessage;

    if (!shouldKeepRecognitionRef.current) {
      return;
    }

    if (isSendingMessage) {
      if (!isPausedForReplyRef.current) {
        pauseCaptureForReply();
      }

      return;
    }

    if (isPausedForReplyRef.current) {
      stopBargeInMonitor();
      isPausedForReplyRef.current = false;
      setSpeechStatus('Listening for next message...');
      void startVoiceCapture();
    }
  }, [isSendingMessage, pauseCaptureForReply, startVoiceCapture, stopBargeInMonitor]);

  useEffect(() => {
    if (!shouldKeepRecognitionRef.current) {
      return;
    }

    if (!isPausedForReplyRef.current || !isAgentSpeaking) {
      stopBargeInMonitor();
      return;
    }

    startBargeInMonitor();
  }, [isAgentSpeaking, isSendingMessage, lastAgentReplyText, startBargeInMonitor, stopBargeInMonitor]);

  return {
    isRecognizing,
    speechStatus,
    startVoiceCapture,
    stopVoiceCapture
  };
}
