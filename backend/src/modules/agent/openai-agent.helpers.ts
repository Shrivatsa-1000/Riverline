export interface GenerateReplyInput {
  message: string;
  userName?: string;
  conversationId?: string;
}

export interface GenerateReplyOutput {
  text: string;
  model: string;
  audioBase64?: string;
  audioMimeType?: string;
  raw: unknown;
}

export interface OpenAiAgentServiceConfig {
  baseUrl: string;
  apiKey?: string;
  model: string;
  agentName: string;
}

interface AudioPayload {
  dataBase64: string;
  mimeType: string;
}

interface OpenAiTarget {
  apiBaseUrl: string;
  realtimeUrl: string;
  model: string;
}

const AGENT_INSTRUCTION_TEMPLATE =
  '{agentName} is a simple, practical financial assistant. Keep answers concise and actionable. Do not use emoji.';

export function buildSystemInstructions(agentName: string) {
  return AGENT_INSTRUCTION_TEMPLATE.replace('{agentName}', agentName);
}

export function buildPrompt(message: string, userName?: string) {
  if (userName && userName.trim()) {
    return `User (${userName}): ${message}`;
  }

  return `User: ${message}`;
}

export function stripEmoji(text: string) {
  return text
    .replace(/[\p{Extended_Pictographic}\p{Emoji_Presentation}\u200D\uFE0F]/gu, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

export function isRealtimeModel(model: string) {
  return /gpt-realtime/i.test(model);
}

export function buildRequestHeaders(baseUrl: string, apiKey: string): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json'
  };

  if (/azure\.com/i.test(baseUrl)) {
    headers['api-key'] = apiKey;
    return headers;
  }

  headers.Authorization = `Bearer ${apiKey}`;
  return headers;
}

export function resolveOpenAiTarget(configuredUrl: string, configuredModel: string): OpenAiTarget {
  const safeUrl = configuredUrl.trim();

  try {
    const parsed = new URL(safeUrl);
    const modelFromQuery = parsed.searchParams.get('model')?.trim();
    const selectedModel = modelFromQuery || configuredModel;

    const httpProtocol = parsed.protocol === 'wss:'
      ? 'https:'
      : parsed.protocol === 'ws:'
        ? 'http:'
        : parsed.protocol;

    const wsProtocol = httpProtocol === 'https:'
      ? 'wss:'
      : httpProtocol === 'http:'
        ? 'ws:'
        : parsed.protocol;

    let path = parsed.pathname.replace(/\/+$/, '');

    if (path.endsWith('/realtime')) {
      path = path.slice(0, -'/realtime'.length);
    }

    const apiBaseUrl = `${httpProtocol}//${parsed.host}${path || ''}`;
    const realtimePath = `${path || ''}/realtime`;
    const realtimeUrl = `${wsProtocol}//${parsed.host}${realtimePath}?model=${encodeURIComponent(selectedModel)}`;

    return {
      apiBaseUrl,
      realtimeUrl,
      model: selectedModel
    };
  } catch {
    const normalizedApiBase = safeUrl.replace(/\/$/, '');
    const realtimeBase = normalizedApiBase
      .replace(/^https:/i, 'wss:')
      .replace(/^http:/i, 'ws:');

    return {
      apiBaseUrl: normalizedApiBase,
      realtimeUrl: `${realtimeBase}/realtime?model=${encodeURIComponent(configuredModel)}`,
      model: configuredModel
    };
  }
}

function mapAudioFormatToMimeType(format: string | undefined) {
  const value = (format || '').toLowerCase();

  switch (value) {
    case 'mp3':
    case 'mpeg':
      return 'audio/mpeg';
    case 'wav':
    case 'pcm16':
      return 'audio/wav';
    case 'opus':
      return 'audio/ogg; codecs=opus';
    case 'ogg':
      return 'audio/ogg';
    case 'flac':
      return 'audio/flac';
    default:
      return 'audio/mpeg';
  }
}

export function normalizeAudioBase64(value: string) {
  return value
    .replace(/^data:[^;]+;base64,/, '')
    .replace(/\s+/g, '')
    .trim();
}

export function parseResponseText(payload: unknown): string {
  if (!payload || typeof payload !== 'object') {
    return '';
  }

  const response = payload as {
    output_text?: unknown;
    output?: unknown;
  };

  if (typeof response.output_text === 'string' && response.output_text.trim()) {
    return response.output_text.trim();
  }

  if (!Array.isArray(response.output)) {
    return '';
  }

  const textParts: string[] = [];

  for (const item of response.output) {
    if (!item || typeof item !== 'object') {
      continue;
    }

    const outputItem = item as { content?: unknown };

    if (!Array.isArray(outputItem.content)) {
      continue;
    }

    for (const contentItem of outputItem.content) {
      if (!contentItem || typeof contentItem !== 'object') {
        continue;
      }

      const value = contentItem as {
        text?: unknown;
        transcript?: unknown;
      };

      if (typeof value.text === 'string' && value.text.trim()) {
        textParts.push(value.text.trim());
        continue;
      }

      if (typeof value.transcript === 'string' && value.transcript.trim()) {
        textParts.push(value.transcript.trim());
      }
    }
  }

  return textParts.join('\n').trim();
}

export function parseResponseAudio(payload: unknown): { audioBase64: string; audioMimeType: string } | null {
  if (!payload || typeof payload !== 'object') {
    return null;
  }

  const response = payload as {
    output?: unknown;
    output_audio?: unknown;
    audio?: unknown;
  };

  const parseAudioNode = (node: unknown): AudioPayload | null => {
    if (!node || typeof node !== 'object') {
      return null;
    }

    const value = node as {
      format?: unknown;
      mime_type?: unknown;
      mimeType?: unknown;
      data?: unknown;
      base64?: unknown;
      b64_json?: unknown;
      audio_base64?: unknown;
      audio?: unknown;
      content?: unknown;
    };

    const rawData =
      typeof value.data === 'string'
        ? value.data
        : typeof value.base64 === 'string'
          ? value.base64
          : typeof value.b64_json === 'string'
            ? value.b64_json
            : typeof value.audio_base64 === 'string'
              ? value.audio_base64
              : '';

    if (rawData.trim()) {
      const format = typeof value.format === 'string' ? value.format : '';
      const mimeType =
        typeof value.mime_type === 'string'
          ? value.mime_type
          : typeof value.mimeType === 'string'
            ? value.mimeType
            : mapAudioFormatToMimeType(format);

      return {
        dataBase64: normalizeAudioBase64(rawData),
        mimeType
      };
    }

    if (value.audio) {
      const nestedAudio = parseAudioNode(value.audio);

      if (nestedAudio) {
        return nestedAudio;
      }
    }

    if (Array.isArray(value.content)) {
      for (const contentItem of value.content) {
        const nestedAudio = parseAudioNode(contentItem);

        if (nestedAudio) {
          return nestedAudio;
        }
      }
    }

    return null;
  };

  const outputAudio = parseAudioNode(response.output_audio);

  if (outputAudio) {
    return {
      audioBase64: outputAudio.dataBase64,
      audioMimeType: outputAudio.mimeType
    };
  }

  const directAudio = parseAudioNode(response.audio);

  if (directAudio) {
    return {
      audioBase64: directAudio.dataBase64,
      audioMimeType: directAudio.mimeType
    };
  }

  if (!Array.isArray(response.output)) {
    return null;
  }

  for (const outputItem of response.output) {
    const audio = parseAudioNode(outputItem);

    if (audio) {
      return {
        audioBase64: audio.dataBase64,
        audioMimeType: audio.mimeType
      };
    }
  }

  return null;
}
