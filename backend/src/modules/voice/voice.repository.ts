import { Collection, ObjectId, type Db } from 'mongodb';
import type { VoiceSessionDocument, VoiceSessionResponse } from './voice.types';

function mapVoiceSession(document: VoiceSessionDocument): VoiceSessionResponse {
  return {
    id: document._id.toHexString(),
    userName: document.userName,
    roomName: document.roomName,
    roomUrl: document.roomUrl,
    roomExpiresAtUnix: document.roomExpiresAtUnix,
    lastTokenExpiresAtUnix: document.lastTokenExpiresAtUnix,
    createdAt: document.createdAt.toISOString(),
    updatedAt: document.updatedAt.toISOString()
  };
}

export class VoiceSessionRepository {
  private readonly sessions: Collection<VoiceSessionDocument>;

  constructor(db: Db) {
    this.sessions = db.collection<VoiceSessionDocument>('voice_sessions');
  }

  async ensureIndexes() {
    await this.sessions.createIndex({ userNameKey: 1 }, { unique: true });
    await this.sessions.createIndex({ roomExpiresAt: 1 }, { expireAfterSeconds: 0 });
    await this.sessions.createIndex({ updatedAt: -1 });
  }

  async findByUserNameKey(userNameKey: string) {
    return this.sessions.findOne({ userNameKey });
  }

  async upsertByUserNameKey(input: {
    userName: string;
    userNameKey: string;
    roomName: string;
    roomUrl: string;
    roomExpiresAtUnix: number;
    lastTokenExpiresAtUnix: number;
  }) {
    const now = new Date();
    const roomExpiresAt = new Date(input.roomExpiresAtUnix * 1000);

    const sessionResult = await this.sessions.findOneAndUpdate(
      { userNameKey: input.userNameKey },
      {
        $set: {
          userName: input.userName,
          roomName: input.roomName,
          roomUrl: input.roomUrl,
          roomExpiresAtUnix: input.roomExpiresAtUnix,
          roomExpiresAt,
          lastTokenExpiresAtUnix: input.lastTokenExpiresAtUnix,
          updatedAt: now
        },
        $setOnInsert: {
          _id: new ObjectId(),
          createdAt: now
        }
      },
      {
        upsert: true,
        returnDocument: 'after'
      }
    );

    if (!sessionResult) {
      throw new Error('Unable to upsert voice session');
    }

    return mapVoiceSession(sessionResult);
  }
}
