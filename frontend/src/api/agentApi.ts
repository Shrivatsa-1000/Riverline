import { getApiBaseUrl } from './apiBaseUrl';
import { httpJson } from './httpJson';

interface AgentReplyResponse {
  reply: string;
  model: string;
  audioBase64?: string;
  audioMimeType?: string;
}

interface OpenAgentSessionResponse extends AgentReplyResponse {}

function normalizeAgentPayload(payload: unknown) {
  if (!payload || typeof payload !== 'object') {
    throw new Error('Invalid agent response payload');
  }

  const response = payload as Partial<AgentReplyResponse>;

  if (typeof response.reply !== 'string') {
    throw new Error('Agent response does not include reply text');
  }

  return {
    reply: response.reply,
    model: typeof response.model === 'string' ? response.model : 'unknown',
    audioBase64: typeof response.audioBase64 === 'string' ? response.audioBase64 : undefined,
    audioMimeType: typeof response.audioMimeType === 'string' ? response.audioMimeType : undefined
  };
}

export async function openAgentSession(input: {
  userName: string;
  conversationId?: string;
}): Promise<OpenAgentSessionResponse> {
  const payload = await httpJson<unknown>(
    `${getApiBaseUrl()}/api/agent/open`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(input)
    },
    {
      fallbackError: 'Unable to open agent session'
    }
  );

  return normalizeAgentPayload(payload);
}

export async function requestAgentReply(input: {
  message: string;
  userName: string;
  source?: 'voice' | 'chat' | 'manual';
  conversationId?: string;
}): Promise<AgentReplyResponse> {
  const payload = await httpJson<unknown>(
    `${getApiBaseUrl()}/api/agent/reply`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        message: input.message,
        userName: input.userName,
        source: input.source,
        conversationId: input.conversationId
      })
    },
    {
      fallbackError: 'Unable to get agent reply'
    }
  );

  return normalizeAgentPayload(payload);
}
