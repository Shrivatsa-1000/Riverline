import { useCallback, useEffect, useRef, type MutableRefObject } from 'react';
import {
  clearRecognitionHandlers,
  getLatestRecognitionText,
  getSpeechRecognitionClass,
  isLikelyAgentEcho,
  isPermissionDeniedError,
  stopRecognitionInstance,
  type SpeechRecognitionLike
} from './speechRecognition';

interface UseMainVoiceCaptureInput {
  hasExternalLevel: boolean;
  isListening: boolean;
  isRecognizing: boolean;
  isSendingMessage: boolean;
  isAgentSpeaking: boolean;
  lastAgentReplyText: string;
  onInterruptAgent: () => boolean;
  onTranscriptAccepted: (transcript: string, statusBeforeSend: string) => void;
  onPermissionDenied: () => void;
  setIsRecognizing: (value: boolean) => void;
  setSpeechStatus: (status: string) => void;
  startListening: () => Promise<void>;
  stopListening: () => void;
  shouldKeepRecognitionRef: MutableRefObject<boolean>;
  isSendingMessageRef: MutableRefObject<boolean>;
  isProcessingTranscriptRef: MutableRefObject<boolean>;
  isPausedForReplyRef: MutableRefObject<boolean>;
  stopBargeInMonitor: () => void;
}

interface UseMainVoiceCaptureResult {
  startVoiceCapture: () => Promise<void>;
  stopVoiceCapture: () => void;
  pauseCaptureForReply: () => void;
}

export function useMainVoiceCapture({
  hasExternalLevel,
  isListening,
  isRecognizing,
  isSendingMessage,
  isAgentSpeaking,
  lastAgentReplyText,
  onInterruptAgent,
  onTranscriptAccepted,
  onPermissionDenied,
  setIsRecognizing,
  setSpeechStatus,
  startListening,
  stopListening,
  shouldKeepRecognitionRef,
  isSendingMessageRef,
  isProcessingTranscriptRef,
  isPausedForReplyRef,
  stopBargeInMonitor
}: UseMainVoiceCaptureInput): UseMainVoiceCaptureResult {
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

  const stopMainRecognition = useCallback(
    (preferAbort: boolean) => {
      const recognition = recognitionRef.current;

      if (!recognition) {
        return;
      }

      clearRecognition();
      stopRecognitionInstance(recognition, preferAbort);
    },
    [clearRecognition]
  );

  const pauseCaptureForReply = useCallback(() => {
    clearRestartTimer();
    stopBargeInMonitor();
    isPausedForReplyRef.current = true;

    stopMainRecognition(true);

    setIsRecognizing(false);
    stopListening();
    setSpeechStatus('Waiting for Paisa reply...');
  }, [
    clearRestartTimer,
    isPausedForReplyRef,
    setIsRecognizing,
    setSpeechStatus,
    stopBargeInMonitor,
    stopListening,
    stopMainRecognition
  ]);

  const stopVoiceCapture = useCallback(() => {
    shouldKeepRecognitionRef.current = false;
    isProcessingTranscriptRef.current = false;
    isPausedForReplyRef.current = false;

    clearRestartTimer();
    stopBargeInMonitor();
    stopMainRecognition(false);

    setIsRecognizing(false);
    stopListening();
    setSpeechStatus('Stopped');
  }, [
    clearRestartTimer,
    isPausedForReplyRef,
    isProcessingTranscriptRef,
    setIsRecognizing,
    setSpeechStatus,
    shouldKeepRecognitionRef,
    stopBargeInMonitor,
    stopListening,
    stopMainRecognition
  ]);

  const tryInterruptIfAgentIsSpeaking = useCallback(() => {
    if (!isSendingMessage) {
      return true;
    }

    if (!isAgentSpeaking) {
      setSpeechStatus('Please wait. Paisa is preparing a reply.');
      return false;
    }

    const interrupted = onInterruptAgent();

    if (!interrupted) {
      setSpeechStatus('Unable to interrupt right now.');
      return false;
    }

    setSpeechStatus('Interrupted Paisa. Listening...');
    return true;
  }, [isAgentSpeaking, isSendingMessage, onInterruptAgent, setSpeechStatus]);

  const isCaptureAlreadyActive = useCallback(() => {
    return hasExternalLevel || isListening || isRecognizing;
  }, [hasExternalLevel, isListening, isRecognizing]);

  const requestSpeechRecognitionSupport = useCallback(() => {
    const SpeechRecognitionClass = getSpeechRecognitionClass();

    if (SpeechRecognitionClass) {
      return SpeechRecognitionClass;
    }

    setSpeechStatus('Speech recognition not supported in this browser.');
    return null;
  }, [setSpeechStatus]);

  const ensureMicrophoneAccess = useCallback(async () => {
    setSpeechStatus('Listening for speech...');

    try {
      await startListening();
      return true;
    } catch {
      setSpeechStatus('Unable to access microphone.');
      return false;
    }
  }, [setSpeechStatus, startListening]);

  const startRecognitionLoop = useCallback(
    (SpeechRecognitionClass: new () => SpeechRecognitionLike) => {
      const scheduleRestart = (delayMs: number) => {
        if (!shouldKeepRecognitionRef.current) {
          return;
        }

        clearRestartTimer();

        restartTimerRef.current = window.setTimeout(() => {
          restartTimerRef.current = null;
          startRecognitionLoop(SpeechRecognitionClass);
        }, delayMs);
      };

      if (!shouldKeepRecognitionRef.current || recognitionRef.current) {
        return;
      }

      const recognition = new SpeechRecognitionClass();
      recognition.lang = 'en-US';
      recognition.continuous = false;
      recognition.interimResults = false;
      recognition.maxAlternatives = 1;

      recognition.onresult = (event) => {
        const { transcript } = getLatestRecognitionText(event);

        if (!transcript) {
          setSpeechStatus('No speech detected. Listening again...');
          return;
        }

        if (isLikelyAgentEcho(transcript, lastAgentReplyText)) {
          setSpeechStatus('Ignoring speaker echo...');
          return;
        }

        if (isProcessingTranscriptRef.current || isSendingMessageRef.current) {
          setSpeechStatus('Waiting for previous message to finish...');
          return;
        }

        pauseCaptureForReply();
        onTranscriptAccepted(transcript, 'Sending voice message...');
      };

      recognition.onerror = (event) => {
        const errorCode = typeof event?.error === 'string' ? event.error : '';

        if (isPermissionDeniedError(errorCode)) {
          clearRestartTimer();
          stopMainRecognition(true);
          onPermissionDenied();
          return;
        }

        setSpeechStatus('Could not capture speech. Retrying...');
      };

      recognition.onend = () => {
        clearRecognition();

        if (!shouldKeepRecognitionRef.current) {
          setIsRecognizing(false);
          stopListening();
          return;
        }

        if (isPausedForReplyRef.current || isSendingMessageRef.current || isProcessingTranscriptRef.current) {
          return;
        }

        scheduleRestart(120);
      };

      recognitionRef.current = recognition;
      setIsRecognizing(true);

      try {
        recognition.start();
      } catch {
        clearRecognition();
        scheduleRestart(400);
      }
    },
    [
      clearRecognition,
      clearRestartTimer,
      isPausedForReplyRef,
      isProcessingTranscriptRef,
      isSendingMessageRef,
      lastAgentReplyText,
      onPermissionDenied,
      onTranscriptAccepted,
      pauseCaptureForReply,
      setIsRecognizing,
      setSpeechStatus,
      shouldKeepRecognitionRef,
      stopListening,
      stopMainRecognition
    ]
  );

  const startVoiceCapture = useCallback(async () => {
    const canStartAfterInterruptCheck = tryInterruptIfAgentIsSpeaking();

    if (!canStartAfterInterruptCheck) {
      return;
    }

    if (isCaptureAlreadyActive()) {
      return;
    }

    stopBargeInMonitor();
    isPausedForReplyRef.current = false;

    const SpeechRecognitionClass = requestSpeechRecognitionSupport();

    if (!SpeechRecognitionClass) {
      return;
    }

    const hasMicrophoneAccess = await ensureMicrophoneAccess();

    if (!hasMicrophoneAccess) {
      return;
    }

    shouldKeepRecognitionRef.current = true;
    startRecognitionLoop(SpeechRecognitionClass);
  }, [
    ensureMicrophoneAccess,
    isCaptureAlreadyActive,
    isPausedForReplyRef,
    requestSpeechRecognitionSupport,
    shouldKeepRecognitionRef,
    startRecognitionLoop,
    stopBargeInMonitor,
    tryInterruptIfAgentIsSpeaking
  ]);

  useEffect(() => {
    return () => {
      stopVoiceCapture();
    };
  }, [stopVoiceCapture]);

  return {
    startVoiceCapture,
    stopVoiceCapture,
    pauseCaptureForReply
  };
}
