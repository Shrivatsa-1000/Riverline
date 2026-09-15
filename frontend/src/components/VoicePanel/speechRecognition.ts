export interface SpeechRecognitionAlternativeLike {
  transcript?: string;
  confidence?: number;
}

export interface SpeechRecognitionResultLike {
  length: number;
  [index: number]: SpeechRecognitionAlternativeLike | undefined;
}

export interface SpeechRecognitionEventLike {
  results: ArrayLike<SpeechRecognitionResultLike>;
}

export interface SpeechRecognitionErrorEventLike {
  error?: string;
}

export interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEventLike) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}

type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;

type SpeechWindow = Window & {
  SpeechRecognition?: SpeechRecognitionConstructor;
  webkitSpeechRecognition?: SpeechRecognitionConstructor;
};

function normalizeSpeechText(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function isLikelyAgentEcho(transcript: string, lastAgentReplyText: string) {
  const normalizedTranscript = normalizeSpeechText(transcript);
  const normalizedReply = normalizeSpeechText(lastAgentReplyText);

  if (!normalizedTranscript || !normalizedReply) {
    return false;
  }

  if (normalizedTranscript.length < 10) {
    return false;
  }

  if (normalizedReply.includes(normalizedTranscript)) {
    return true;
  }

  const transcriptWords = normalizedTranscript.split(' ').filter(Boolean);

  if (transcriptWords.length < 3) {
    return false;
  }

  const replyWords = new Set(normalizedReply.split(' ').filter(Boolean));
  let overlapCount = 0;

  for (const word of transcriptWords) {
    if (replyWords.has(word)) {
      overlapCount += 1;
    }
  }

  const overlapRatio = overlapCount / transcriptWords.length;
  return overlapRatio >= 0.85;
}

export function isLikelyIntentionalBargeIn(transcript: string, confidence?: number) {
  const normalized = normalizeSpeechText(transcript);

  if (!normalized) {
    return false;
  }

  const interruptKeywords = ['stop', 'wait', 'hold', 'listen', 'pause'];

  if (interruptKeywords.some((keyword) => normalized === keyword || normalized.startsWith(`${keyword} `))) {
    return true;
  }

  if (typeof confidence === 'number' && confidence > 0 && confidence < 0.55) {
    return false;
  }

  const words = normalized.split(' ').filter(Boolean);
  return normalized.length >= 12 && words.length >= 3;
}

export function getSpeechRecognitionClass() {
  const speechWindow = window as SpeechWindow;
  return speechWindow.SpeechRecognition || speechWindow.webkitSpeechRecognition || null;
}

export function getLatestRecognitionText(event: SpeechRecognitionEventLike) {
  if (!event.results || event.results.length === 0) {
    return {
      transcript: '',
      confidence: undefined
    };
  }

  const latestResult = event.results[event.results.length - 1];
  const firstOption = latestResult?.[0];

  return {
    transcript: (firstOption?.transcript || '').trim(),
    confidence: typeof firstOption?.confidence === 'number' ? Number(firstOption.confidence) : undefined
  };
}

export function clearRecognitionHandlers(recognition: SpeechRecognitionLike) {
  recognition.onresult = null;
  recognition.onerror = null;
  recognition.onend = null;
}

export function stopRecognitionInstance(recognition: SpeechRecognitionLike, preferAbort: boolean) {
  try {
    if (preferAbort) {
      recognition.abort();
      return;
    }

    recognition.stop();
  } catch {
    if (!preferAbort) {
      return;
    }

    try {
      recognition.stop();
    } catch {
      // no-op
    }
  }
}

export function isPermissionDeniedError(errorCode: string) {
  return errorCode === 'not-allowed' || errorCode === 'service-not-allowed';
}
