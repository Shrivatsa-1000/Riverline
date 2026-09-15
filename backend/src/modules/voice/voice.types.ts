import type { ObjectId } from 'mongodb';

export interface VoiceSessionDocument {
  _id: ObjectId;
  userName: string;
  userNameKey: string;
  roomName: string;
  roomUrl: string;
  roomExpiresAtUnix: number;
  roomExpiresAt: Date;
  lastTokenExpiresAtUnix: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface VoiceSessionResponse {
  id: string;
  userName: string;
  roomName: string;
  roomUrl: string;
  roomExpiresAtUnix: number;
  lastTokenExpiresAtUnix: number;
  createdAt: string;
  updatedAt: string;
}
