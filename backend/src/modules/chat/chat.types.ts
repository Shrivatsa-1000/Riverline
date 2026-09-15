import type { ObjectId } from 'mongodb';

export type SenderRole = 'user' | 'agent';

export interface UserDocument {
  _id: ObjectId;
  name: string;
  nameKey: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface ChatDocument {
  _id: ObjectId;
  userId: ObjectId;
  userName: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface ChatMessageDocument {
  _id: ObjectId;
  chatId: ObjectId;
  senderRole: SenderRole;
  senderName: string;
  content: string;
  createdAt: Date;
}

export interface ChatResponse {
  id: string;
  userId: string;
  userName: string;
  createdAt: string;
  updatedAt: string;
}

export interface ChatMessageResponse {
  id: string;
  chatId: string;
  senderRole: SenderRole;
  senderName: string;
  content: string;
  createdAt: string;
}

export interface ChatSessionResponse {
  chat: ChatResponse;
  reusedChat: boolean;
  messages: ChatMessageResponse[];
}
