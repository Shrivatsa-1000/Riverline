import { HttpError } from '../../lib/http-error';
import { requestWithResilience } from '../../lib/outbound-http';
import {
  buildPrompt,
  buildRequestHeaders,
  buildSystemInstructions,
  isRealtimeModel,
  parseResponseAudio,
  parseResponseText,
  resolveOpenAiTarget,
  stripEmoji
} from './openai-agent.helpers';
import type {
  GenerateReplyInput,
  GenerateReplyOutput,
  OpenAiAgentServiceConfig
} from './openai-agent.helpers';
import { generateRealtimeReply } from './openai-agent.realtime.client';

function safeJsonParse(rawText: string): unknown {
  if (!rawText.trim()) {
    return null;
  }

  try {
    return JSON.parse(rawText) as unknown;
  } catch {
    return { rawText };
  }
}

async function sendResponseRequest(input: {
  baseUrl: string;
  headers: Record<string, string>;
  body: Record<string, unknown>;
}) {
  const { response, rawText } = await requestWithResilience({
    url: `${input.baseUrl}/responses`,
    method: 'POST',
    headers: input.headers,
    body: JSON.stringify(input.body),
    timeoutMs: 12_000,
    maxRetries: 2,
    retryDelayMs: 300
  });

  return {
    ok: response.ok,
    status: response.status,
    rawText,
    rawJson: safeJsonParse(rawText)
  };
}

export class OpenAiAgentService {
  constructor(private readonly config: OpenAiAgentServiceConfig) {}

  async generateReply(input: GenerateReplyInput): Promise<GenerateReplyOutput> {
    const apiKey = this.config.apiKey;

    if (!apiKey) {
      throw new HttpError(503, 'OpenAI agent is not configured. Set OPENAI_API_KEY.');
    }

    const target = resolveOpenAiTarget(this.config.baseUrl, this.config.model);
    const baseUrl = target.apiBaseUrl.replace(/\/$/, '');
    const headers = buildRequestHeaders(baseUrl, apiKey);
    const prompt = buildPrompt(input.message, input.userName);

    if (isRealtimeModel(target.model)) {
      return generateRealtimeReply({
        realtimeUrl: target.realtimeUrl,
        headers,
        model: target.model,
        prompt,
        agentName: this.config.agentName
      });
    }

    const systemInstructions = buildSystemInstructions(this.config.agentName);

    const result = await sendResponseRequest({
      baseUrl,
      headers,
      body: {
        model: target.model,
        input: [
          {
            role: 'system',
            content: systemInstructions
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        metadata: input.conversationId
          ? {
              conversationId: input.conversationId
            }
          : undefined
      }
    });

    if (!result.ok) {
      throw new HttpError(502, `OpenAI request failed (${result.status}): ${result.rawText}`);
    }

    const text = stripEmoji(parseResponseText(result.rawJson));

    if (!text) {
      throw new HttpError(502, 'OpenAI response did not include text output.');
    }

    const audio = parseResponseAudio(result.rawJson);

    return {
      text,
      model: target.model,
      audioBase64: audio?.audioBase64,
      audioMimeType: audio?.audioMimeType,
      raw: result.rawJson
    };
  }
}
