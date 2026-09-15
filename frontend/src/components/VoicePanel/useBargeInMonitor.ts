import { useCallback, useEffect, useRef, type MutableRefObject } from 'react';
import {
  clearRecognitionHandlers,
  getLatestRecognitionText,
  getSpeechRecognitionClass,
  isLikelyAgentEcho,
  isLikelyIntentionalBargeIn,
  isPermissionDeniedError,
  stopRecognitionInstance,
  type SpeechRecognitionLike
} from './speechRecognition';

interface UseBargeInMonitorInput {
  shouldKeepRecognitionRef: MutableRefObject<boolean>;
  isPausedForReplyRef: MutableRefObject<boolean>;
  isProcessingTranscriptRef: MutableRefObject<boolean>;
  isAgentSpeaking: boolean;
  lastAgentReplyText: string;
  onInterruptAgent: () => boolean;
  onTranscriptAccepted: (transcript: string, statusBeforeSend: string) => void;
  onPermissionDenied: () => void;
  setSpeechStatus: (status: string) => void;
}

interface UseBargeInMonitorResult {
  startBargeInMonitor: () => void;
  stopBargeInMonitor: () => void;
}

export function useBargeInMonitor({
  shouldKeepRecognitionRef,
  isPausedForReplyRef,
  isProcessingTranscriptRef,
  isAgentSpeaking,
  lastAgentReplyText,
  onInterruptAgent,
  onTranscriptAccepted,
  onPermissionDenied,
  setSpeechStatus
}: UseBargeInMonitorInput): UseBargeInMonitorResult {
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const restartTimerRef = useRef<number | null>(null);

  const clearRestartTimer = useCallback(() => {
    if (restartTimerRef.current === null) {
      return;
    }

    window.clearTimeout(restartTimerRef.current);
    restartTimerRef.current = null;
  }, []);

  const clearRecognition = useCallback(() => {
    const recognition = recognitionRef.current;

    if (!recognition) {
      return;
    }

    clearRecognitionHandlers(recognition);
    recognitionRef.current = null;
  }, []);

  const stopBargeInMonitor = useCallback(() => {
    clearRestartTimer();

    const recognition = recognitionRef.current;

    if (!recognition) {
      return;
    }

    clearRecognition();
    stopRecognitionInstance(recognition, true);
  }, [clearRecognition, clearRestartTimer]);

  const startBargeInMonitor = useCallback(() => {
    if (!shouldKeepRecognitionRef.current || !isPausedForReplyRef.current || !isAgentSpeaking) {
      return;
    }

    if (recognitionRef.current) {
      return;
    }

    const SpeechRecognitionClass = getSpeechRecognitionClass();

    if (!SpeechRecognitionClass) {
      return;
    }

    const scheduleRestart = (delayMs: number) => {
      if (!shouldKeepRecognitionRef.current || !isPausedForReplyRef.current || !isAgentSpeaking) {
        return;
      }

      clearRestartTimer();

      restartTimerRef.current = window.setTimeout(() => {
        restartTimerRef.current = null;
        startBargeInMonitor();
      }, delayMs);
    };

    const recognition = new SpeechRecognitionClass();
    recognition.lang = 'en-US';
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    recognition.onresult = (event) => {
      const { transcript, confidence } = getLatestRecognitionText(event);

      if (!transcript) {
        setSpeechStatus('Paisa is speaking. Start speaking to interrupt.');
        return;
      }

      if (!isLikelyIntentionalBargeIn(transcript, confidence)) {
        setSpeechStatus('Ignoring weak barge-in signal...');
        return;
      }

      if (isLikelyAgentEcho(transcript, lastAgentReplyText)) {
        setSpeechStatus('Ignoring Paisa playback...');
        return;
      }

      if (isProcessingTranscriptRef.current) {
        return;
      }

      const interrupted = onInterruptAgent();

      if (!interrupted) {
        setSpeechStatus('Unable to interrupt right now.');
        return;
      }

      stopBargeInMonitor();
      onTranscriptAccepted(transcript, 'Interrupted Paisa. Sending your voice message...');
    };

    recognition.onerror = (event) => {
      const errorCode = typeof event?.error === 'string' ? event.error : '';

      if (isPermissionDeniedError(errorCode)) {
        stopBargeInMonitor();
        onPermissionDenied();
        return;
      }

      setSpeechStatus('Barge-in check failed. Retrying...');
    };

    recognition.onend = () => {
      clearRecognition();

      if (!shouldKeepRecognitionRef.current || !isPausedForReplyRef.current || !isAgentSpeaking) {
        return;
      }

      if (isProcessingTranscriptRef.current) {
        return;
      }

      scheduleRestart(150);
    };

    recognitionRef.current = recognition;
    setSpeechStatus('Paisa is speaking. Start speaking to interrupt.');

    try {
      recognition.start();
    } catch {
      clearRecognition();
      scheduleRestart(300);
    }
  }, [
    clearRecognition,
    clearRestartTimer,
    isAgentSpeaking,
    isPausedForReplyRef,
    isProcessingTranscriptRef,
    lastAgentReplyText,
    onInterruptAgent,
    onPermissionDenied,
    onTranscriptAccepted,
    setSpeechStatus,
    shouldKeepRecognitionRef,
    stopBargeInMonitor
  ]);

  useEffect(() => {
    return () => {
      stopBargeInMonitor();
    };
  }, [stopBargeInMonitor]);

  return {
    startBargeInMonitor,
    stopBargeInMonitor
  };
}
