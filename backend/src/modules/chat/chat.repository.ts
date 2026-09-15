import { Collection, ObjectId, type Db } from 'mongodb';
import type {
  ChatDocument,
  ChatMessageDocument,
  ChatMessageResponse,
  ChatSessionResponse,
  ChatResponse,
  SenderRole,
  UserDocument
} from './chat.types';

function normalizeName(name: string) {
  return name.trim().replace(/\s+/g, ' ');
}

function nameKey(name: string) {
  return normalizeName(name).toLowerCase();
}

function mapChat(document: ChatDocument): ChatResponse {
  return {
    id: document._id.toHexString(),
    userId: document.userId.toHexString(),
    userName: document.userName,
    createdAt: document.createdAt.toISOString(),
    updatedAt: document.updatedAt.toISOString()
  };
}

function mapMessage(document: ChatMessageDocument): ChatMessageResponse {
  return {
    id: document._id.toHexString(),
    chatId: document.chatId.toHexString(),
    senderRole: document.senderRole,
    senderName: document.senderName,
    content: document.content,
    createdAt: document.createdAt.toISOString()
  };
}

export class ChatRepository {
  private readonly users: Collection<UserDocument>;
  private readonly chats: Collection<ChatDocument>;
  private readonly messages: Collection<ChatMessageDocument>;

  constructor(db: Db) {
    this.users = db.collection<UserDocument>('users');
    this.chats = db.collection<ChatDocument>('chats');
    this.messages = db.collection<ChatMessageDocument>('chat_messages');
  }

  async ensureIndexes() {
    await this.users.createIndex({ nameKey: 1 }, { unique: true });
    await this.chats.createIndex({ userId: 1, updatedAt: -1 });
    await this.chats.createIndex({ updatedAt: -1 });
    await this.messages.createIndex({ chatId: 1, createdAt: 1 });
    await this.messages.createIndex({ chatId: 1, _id: -1 });
  }

  async createOrLoadChatSession(input: {
    userName: string;
    reuseLatest: boolean;
    historyLimit: number;
  }): Promise<ChatSessionResponse> {
    const now = new Date();
    const safeName = normalizeName(input.userName) || 'Anonymous';

    const userResult = await this.users.findOneAndUpdate(
      { nameKey: nameKey(safeName) },
      {
        $set: {
          name: safeName,
          updatedAt: now
        },
        $setOnInsert: {
          createdAt: now
        }
      },
      {
        upsert: true,
        returnDocument: 'after'
      }
    );

    if (!userResult) {
      throw new Error('Unable to create or load user');
    }

    let selectedChat = input.reuseLatest
      ? await this.chats.findOne({ userId: userResult._id }, { sort: { updatedAt: -1 } })
      : null;

    const reusedChat = Boolean(selectedChat);

    if (!selectedChat) {
      selectedChat = {
        _id: new ObjectId(),
        userId: userResult._id,
        userName: userResult.name,
        createdAt: now,
        updatedAt: now
      };

      await this.chats.insertOne(selectedChat);
    }

    const messages = await this.listMessages({
      chatId: selectedChat._id.toHexString(),
      limit: input.historyLimit
    });

    return {
      chat: mapChat(selectedChat),
      reusedChat,
      messages
    };
  }

  async listChats(limit: number) {
    const size = Math.min(Math.max(limit, 1), 100);

    const chats = await this.chats.find().sort({ updatedAt: -1 }).limit(size).toArray();
    return chats.map(mapChat);
  }

  async appendMessage(input: {
    chatId: string;
    senderRole: SenderRole;
    senderName: string;
    content: string;
  }) {
    const now = new Date();
    const chatObjectId = new ObjectId(input.chatId);

    const chat = await this.chats.findOne({ _id: chatObjectId });

    if (!chat) {
      return null;
    }

    const message: ChatMessageDocument = {
      _id: new ObjectId(),
      chatId: chatObjectId,
      senderRole: input.senderRole,
      senderName: normalizeName(input.senderName) || (input.senderRole === 'agent' ? 'Paisa' : 'User'),
      content: input.content.trim(),
      createdAt: now
    };

    await this.messages.insertOne(message);

    await this.chats.updateOne(
      { _id: chatObjectId },
      {
        $set: {
          updatedAt: now
        }
      }
    );

    return mapMessage(message);
  }

  async listMessages(input: {
    chatId: string;
    limit: number;
    beforeMessageId?: string;
  }) {
    const chatObjectId = new ObjectId(input.chatId);
    const size = Math.min(Math.max(input.limit, 1), 200);

    const query: {
      chatId: ObjectId;
      _id?: { $lt: ObjectId };
    } = {
      chatId: chatObjectId
    };

    if (input.beforeMessageId) {
      query._id = { $lt: new ObjectId(input.beforeMessageId) };
    }

    const messages = await this.messages.find(query).sort({ _id: -1 }).limit(size).toArray();

    return messages.reverse().map(mapMessage);
  }

  async chatExists(chatId: string) {
    const found = await this.chats.findOne(
      { _id: new ObjectId(chatId) },
      {
        projection: { _id: 1 }
      }
    );

    return Boolean(found);
  }
}
