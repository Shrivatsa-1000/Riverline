import WebSocket, { type RawData } from 'ws';
import { HttpError } from '../../lib/http-error';
import {
  buildSystemInstructions,
  normalizeAudioBase64,
  parseResponseText,
  stripEmoji
} from './openai-agent.helpers';
import type { GenerateReplyOutput } from './openai-agent.helpers';

interface GenerateRealtimeReplyInput {
  realtimeUrl: string;
  headers: Record<string, string>;
  model: string;
  prompt: string;
  agentName: string;
}

const REALTIME_PCM_SAMPLE_RATE = 24_000;
const REALTIME_PCM_CHANNELS = 1;
const REALTIME_PCM_BITS_PER_SAMPLE = 16;

function parseRealtimeErrorMessage(event: unknown): string {
  if (!event || typeof event !== 'object') {
    return 'Unknown realtime error';
  }

  const value = event as {
    error?: {
      message?: unknown;
    };
    message?: unknown;
  };

  if (typeof value.error?.message === 'string' && value.error.message.trim()) {
    return value.error.message;
  }

  if (typeof value.message === 'string' && value.message.trim()) {
    return value.message;
  }

  return 'Unknown realtime error';
}

function rawDataToUtf8(rawData: RawData): string {
  if (typeof rawData === 'string') {
    return rawData;
  }

  if (Buffer.isBuffer(rawData)) {
    return rawData.toString('utf8');
  }

  if (rawData instanceof ArrayBuffer) {
    return Buffer.from(rawData).toString('utf8');
  }

  if (Array.isArray(rawData)) {
    return Buffer.concat(rawData.map((part) => Buffer.isBuffer(part) ? part : Buffer.from(part))).toString('utf8');
  }

  return '';
}

function detectAudioMimeType(buffer: Buffer): string | null {
  if (buffer.length >= 12 && buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WAVE') {
    return 'audio/wav';
  }

  if (buffer.length >= 3 && buffer.toString('ascii', 0, 3) === 'ID3') {
    return 'audio/mpeg';
  }

  if (buffer.length >= 2 && buffer[0] === 0xff && (buffer[1] & 0xe0) === 0xe0) {
    return 'audio/mpeg';
  }

  if (buffer.length >= 4 && buffer.toString('ascii', 0, 4) === 'OggS') {
    return 'audio/ogg';
  }

  return null;
}

function pcm16ToWavBuffer(input: Buffer): Buffer {
  const bytesPerSample = REALTIME_PCM_BITS_PER_SAMPLE / 8;
  const blockAlign = REALTIME_PCM_CHANNELS * bytesPerSample;
  const byteRate = REALTIME_PCM_SAMPLE_RATE * blockAlign;
  const dataSize = input.length;
  const riffChunkSize = 36 + dataSize;

  const header = Buffer.alloc(44);

  header.write('RIFF', 0, 4, 'ascii');
  header.writeUInt32LE(riffChunkSize, 4);
  header.write('WAVE', 8, 4, 'ascii');
  header.write('fmt ', 12, 4, 'ascii');
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(REALTIME_PCM_CHANNELS, 22);
  header.writeUInt32LE(REALTIME_PCM_SAMPLE_RATE, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(REALTIME_PCM_BITS_PER_SAMPLE, 34);
  header.write('data', 36, 4, 'ascii');
  header.writeUInt32LE(dataSize, 40);

  return Buffer.concat([header, input]);
}

function normalizeRealtimeAudioForBrowserBuffer(audioBuffer: Buffer) {
  if (audioBuffer.length === 0) {
    return null;
  }

  const detectedMimeType = detectAudioMimeType(audioBuffer);

  if (detectedMimeType) {
    return {
      audioBase64: audioBuffer.toString('base64'),
      audioMimeType: detectedMimeType
    };
  }

  const wavBuffer = pcm16ToWavBuffer(audioBuffer);

  return {
    audioBase64: wavBuffer.toString('base64'),
    audioMimeType: 'audio/wav'
  };
}

export async function generateRealtimeReply(input: GenerateRealtimeReplyInput): Promise<GenerateReplyOutput> {
  const instructions = buildSystemInstructions(input.agentName);

  return new Promise<GenerateReplyOutput>((resolve, reject) => {
    const ws = new WebSocket(input.realtimeUrl, {
      headers: input.headers
    });

    const textParts: string[] = [];
    const audioChunks: Buffer[] = [];
    const events: unknown[] = [];

    let settled = false;

    const timeout = setTimeout(() => {
      if (settled) {
        return;
      }

      settled = true;
      ws.close();
      reject(new HttpError(504, 'Realtime agent timed out while waiting for response.'));
    }, 40_000);

    const finishWithError = (error: unknown) => {
      if (settled) {
        return;
      }

      settled = true;
      clearTimeout(timeout);
      ws.close();

      if (error instanceof HttpError) {
        reject(error);
        return;
      }

      const message = error instanceof Error ? error.message : 'Realtime websocket failure';
      reject(new HttpError(502, message));
    };

    const finishWithSuccess = (eventPayload?: unknown) => {
      if (settled) {
        return;
      }

      settled = true;
      clearTimeout(timeout);
      ws.close();

      const collectedText = stripEmoji(textParts.join('').trim());
      const fallbackText = stripEmoji(parseResponseText(eventPayload));
      const text = collectedText || fallbackText;

      if (!text) {
        reject(new HttpError(502, 'Realtime response did not include text output.'));
        return;
      }

      const combinedAudio = audioChunks.length > 0 ? Buffer.concat(audioChunks) : Buffer.alloc(0);
      const audio = normalizeRealtimeAudioForBrowserBuffer(combinedAudio);

      resolve({
        text,
        model: input.model,
        audioBase64: audio?.audioBase64,
        audioMimeType: audio?.audioMimeType,
        raw: { events }
      });
    };

    ws.on('open', () => {
      const messageEvent = {
        type: 'conversation.item.create',
        item: {
          type: 'message',
          role: 'user',
          content: [
            {
              type: 'input_text',
              text: `${instructions}\n\n${input.prompt}`
            }
          ]
        }
      };

      const responseEvent = {
        type: 'response.create'
      };

      ws.send(JSON.stringify(messageEvent));
      ws.send(JSON.stringify(responseEvent));
    });

    ws.on('message', (rawMessage: RawData) => {
      let event: unknown;

      try {
        const payload = rawDataToUtf8(rawMessage);

        if (!payload) {
          return;
        }

        event = JSON.parse(payload) as unknown;
      } catch {
        return;
      }

      events.push(event);

      if (!event || typeof event !== 'object') {
        return;
      }

      const realtimeEvent = event as {
        type?: unknown;
        delta?: unknown;
        response?: unknown;
      };

      const type = typeof realtimeEvent.type === 'string' ? realtimeEvent.type : '';

      if (type === 'error') {
        finishWithError(new HttpError(502, `Realtime request failed: ${parseRealtimeErrorMessage(event)}`));
        return;
      }

      if (
        type === 'response.output_text.delta' ||
        type === 'response.text.delta' ||
        type === 'response.audio_transcript.delta' ||
        type === 'response.output_audio_transcript.delta'
      ) {
        if (typeof realtimeEvent.delta === 'string') {
          textParts.push(realtimeEvent.delta);
        }

        return;
      }

      if (type === 'response.audio.delta' || type === 'response.output_audio.delta') {
        if (typeof realtimeEvent.delta === 'string') {
          const deltaBase64 = normalizeAudioBase64(realtimeEvent.delta);

          if (deltaBase64) {
            try {
              audioChunks.push(Buffer.from(deltaBase64, 'base64'));
            } catch {
              // ignore malformed chunk
            }
          }
        }

        return;
      }

      if (type === 'response.done' || type === 'response.completed') {
        finishWithSuccess(realtimeEvent.response || event);
      }
    });

    ws.on('error', (error: Error) => {
      finishWithError(error);
    });

    ws.on('close', () => {
      if (!settled) {
        finishWithError(new HttpError(502, 'Realtime websocket closed before response completed.'));
      }
    });
  });
}
