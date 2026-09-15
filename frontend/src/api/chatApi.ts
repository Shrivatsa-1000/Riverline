import { getApiBaseUrl } from './apiBaseUrl';
import { httpJson } from './httpJson';

export interface ChatSummary {
  id: string;
  userId: string;
  userName: string;
  createdAt: string;
  updatedAt: string;
}

export interface ChatMessage {
  id: string;
  chatId: string;
  senderRole: 'user' | 'agent';
  senderName: string;
  content: string;
  createdAt: string;
}

export interface ChatSession {
  chat: ChatSummary;
  reusedChat: boolean;
  messages: ChatMessage[];
}

export async function createChat(
  userName: string,
  options?: {
    reuseLatest?: boolean;
    historyLimit?: number;
  }
): Promise<ChatSession> {
  const payload = await httpJson<unknown>(
    `${getApiBaseUrl()}/api/chats`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        userName,
        reuseLatest: options?.reuseLatest,
        historyLimit: options?.historyLimit
      })
    },
    {
      fallbackError: 'Unable to create chat'
    }
  );

  if (!payload || typeof payload !== 'object') {
    throw new Error('Chat session payload is invalid');
  }

  const chatSession = payload as Partial<ChatSession>;

  if (!chatSession.chat) {
    throw new Error('Chat session payload is invalid');
  }

  return {
    chat: chatSession.chat,
    reusedChat: Boolean(chatSession.reusedChat),
    messages: Array.isArray(chatSession.messages) ? chatSession.messages : []
  };
}

export async function listChatMessages(input: {
  chatId: string;
  limit?: number;
  beforeMessageId?: string;
}): Promise<ChatMessage[]> {
  const query = new URLSearchParams();

  if (input.limit) {
    query.set('limit', String(input.limit));
  }

  if (input.beforeMessageId) {
    query.set('beforeMessageId', input.beforeMessageId);
  }

  const queryString = query.toString();
  const url = `${getApiBaseUrl()}/api/chats/${input.chatId}/messages${queryString ? `?${queryString}` : ''}`;

  const payload = await httpJson<unknown>(url, undefined, {
    fallbackError: 'Unable to list chat messages'
  });

  if (!payload || typeof payload !== 'object') {
    return [];
  }

  const normalizedPayload = payload as { messages?: ChatMessage[] };
  return Array.isArray(normalizedPayload.messages) ? normalizedPayload.messages : [];
}

export async function appendChatMessage(input: {
  chatId: string;
  senderRole: 'user' | 'agent';
  senderName: string;
  content: string;
}): Promise<ChatMessage> {
  const payload = await httpJson<unknown>(
    `${getApiBaseUrl()}/api/chats/${input.chatId}/messages`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        senderRole: input.senderRole,
        senderName: input.senderName,
        content: input.content
      })
    },
    {
      fallbackError: 'Unable to append chat message'
    }
  );

  if (!payload || typeof payload !== 'object') {
    throw new Error('Append message payload is invalid');
  }

  const normalizedPayload = payload as { message?: ChatMessage };

  if (!normalizedPayload.message) {
    throw new Error('Append message payload is invalid');
  }

  return normalizedPayload.message;
}
