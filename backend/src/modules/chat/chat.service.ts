import { ObjectId } from 'mongodb';
import { HttpError } from '../../lib/http-error';
import type { ChatRepository } from './chat.repository';
import type { SenderRole } from './chat.types';

interface AppendMessageInput {
  chatId: string;
  senderRole: SenderRole;
  senderName?: string;
  content: string;
}

interface ListMessagesInput {
  chatId: string;
  limit?: number;
  beforeMessageId?: string;
}

interface CreateChatSessionInput {
  userName?: string;
  reuseLatest?: boolean;
  historyLimit?: number;
}

function isValidObjectId(value: string) {
  return ObjectId.isValid(value) && new ObjectId(value).toHexString() === value;
}

export class ChatService {
  constructor(
    private readonly chatRepository: ChatRepository,
    private readonly agentName: string
  ) {}

  async createChat(input: CreateChatSessionInput) {
    return this.chatRepository.createOrLoadChatSession({
      userName: input.userName || 'Ankit',
      reuseLatest: input.reuseLatest ?? true,
      historyLimit: input.historyLimit ?? 300
    });
  }

  async listChats(limit?: number) {
    return this.chatRepository.listChats(limit ?? 20);
  }

  async listMessages(input: ListMessagesInput) {
    if (!isValidObjectId(input.chatId)) {
      throw new HttpError(400, 'Invalid chatId');
    }

    if (input.beforeMessageId && !isValidObjectId(input.beforeMessageId)) {
      throw new HttpError(400, 'Invalid beforeMessageId');
    }

    const exists = await this.chatRepository.chatExists(input.chatId);

    if (!exists) {
      throw new HttpError(404, 'Chat not found');
    }

    return this.chatRepository.listMessages({
      chatId: input.chatId,
      limit: input.limit ?? 50,
      beforeMessageId: input.beforeMessageId
    });
  }

  async appendMessage(input: AppendMessageInput) {
    if (!isValidObjectId(input.chatId)) {
      throw new HttpError(400, 'Invalid chatId');
    }

    const senderName = input.senderName || (input.senderRole === 'agent' ? this.agentName : 'User');

    const message = await this.chatRepository.appendMessage({
      chatId: input.chatId,
      senderRole: input.senderRole,
      senderName,
      content: input.content
    });

    if (!message) {
      throw new HttpError(404, 'Chat not found');
    }

    return message;
  }
}
