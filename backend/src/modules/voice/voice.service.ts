import { HttpError } from '../../lib/http-error';
import { DailyApiClient, isDailyApiError } from './daily.client';
import type { VoiceSessionRepository } from './voice.repository';

interface CreatePrivateRoomInput {
  roomName?: string;
  expiresInSeconds: number;
}

interface CreateRoomTokenInput {
  roomName: string;
  userName: string;
  expiresInSeconds: number;
}

interface CreateOrRefreshSessionInput {
  userName: string;
  roomExpiresInSeconds?: number;
  tokenExpiresInSeconds?: number;
}

interface VoiceServiceConfig {
  dailyApiUrl: string;
  dailyApiKey?: string;
  defaultRoomExpireSeconds: number;
  defaultTokenExpireSeconds: number;
  agentName: string;
}

const MINIMUM_REUSABLE_ROOM_WINDOW_SECONDS = 180;

function getNowUnix() {
  return Math.floor(Date.now() / 1000);
}

function getExpiresAtUnix(expiresInSeconds: number): number {
  return getNowUnix() + expiresInSeconds;
}

function normalizeName(name: string) {
  return name.trim().replace(/\s+/g, ' ');
}

function nameKey(name: string) {
  return normalizeName(name).toLowerCase();
}

function toSlug(name: string) {
  return normalizeName(name)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 32);
}

function randomSuffix() {
  return Math.random().toString(36).slice(2, 8);
}

function buildRoomName(userName: string) {
  const slug = toSlug(userName) || 'user';
  return `paisa-${slug}-${randomSuffix()}`;
}

export class VoiceService {
  constructor(
    private readonly config: VoiceServiceConfig,
    private readonly voiceSessionRepository: VoiceSessionRepository
  ) {}

  async createOrRefreshSession(input: CreateOrRefreshSessionInput) {
    const safeUserName = normalizeName(input.userName);

    if (!safeUserName) {
      throw new HttpError(400, 'userName is required');
    }

    const requestedRoomExpireSeconds = input.roomExpiresInSeconds ?? this.config.defaultRoomExpireSeconds;
    const requestedTokenExpireSeconds = input.tokenExpiresInSeconds ?? this.config.defaultTokenExpireSeconds;
    const nowUnix = getNowUnix();

    const existingSession = await this.voiceSessionRepository.findByUserNameKey(nameKey(safeUserName));

    let reusedRoom = false;
    let roomName = '';
    let roomUrl = '';
    let roomExpiresAtUnix = 0;

    if (
      existingSession &&
      existingSession.roomExpiresAtUnix - nowUnix > MINIMUM_REUSABLE_ROOM_WINDOW_SECONDS
    ) {
      reusedRoom = true;
      roomName = existingSession.roomName;
      roomUrl = existingSession.roomUrl;
      roomExpiresAtUnix = existingSession.roomExpiresAtUnix;
    } else {
      const createdRoom = await this.createPrivateRoom({
        roomName: buildRoomName(safeUserName),
        expiresInSeconds: requestedRoomExpireSeconds
      });

      roomName = createdRoom.name;
      roomUrl = createdRoom.url;
      roomExpiresAtUnix = createdRoom.expiresAtUnix ?? getExpiresAtUnix(requestedRoomExpireSeconds);
    }

    const maxTokenWindowSeconds = Math.max(60, roomExpiresAtUnix - nowUnix - 30);
    const effectiveTokenExpireSeconds = Math.min(requestedTokenExpireSeconds, maxTokenWindowSeconds);

    const tokens = await this.createRoomTokens({
      roomName,
      userName: safeUserName,
      expiresInSeconds: effectiveTokenExpireSeconds
    });

    const session = await this.voiceSessionRepository.upsertByUserNameKey({
      userName: safeUserName,
      userNameKey: nameKey(safeUserName),
      roomName,
      roomUrl,
      roomExpiresAtUnix,
      lastTokenExpiresAtUnix: tokens.expiresAtUnix
    });

    return {
      reusedRoom,
      room: {
        name: session.roomName,
        url: session.roomUrl,
        expiresAtUnix: session.roomExpiresAtUnix
      },
      user: tokens.user,
      agent: tokens.agent,
      tokenExpiresAtUnix: tokens.expiresAtUnix,
      session
    };
  }

  async createPrivateRoom(input: CreatePrivateRoomInput) {
    const dailyClient = this.getDailyClient();

    try {
      const room = await dailyClient.createPrivateRoom({
        roomName: input.roomName,
        expiresAtUnix: getExpiresAtUnix(input.expiresInSeconds)
      });

      return {
        id: room.id,
        name: room.name,
        url: room.url,
        privacy: room.privacy,
        createdAt: room.created_at,
        expiresAtUnix: room.config?.exp
      };
    } catch (error) {
      this.throwIfDailyApiError(error, 'creating room');
      throw error;
    }
  }

  async createRoomTokens(input: CreateRoomTokenInput) {
    const dailyClient = this.getDailyClient();
    const expiresAtUnix = getExpiresAtUnix(input.expiresInSeconds);

    try {
      const [userToken, agentToken] = await Promise.all([
        dailyClient.createMeetingToken({
          roomName: input.roomName,
          userName: input.userName,
          isOwner: false,
          expiresAtUnix
        }),
        dailyClient.createMeetingToken({
          roomName: input.roomName,
          userName: this.config.agentName,
          isOwner: true,
          expiresAtUnix
        })
      ]);

      return {
        roomName: input.roomName,
        expiresAtUnix,
        user: {
          name: input.userName,
          token: userToken.token
        },
        agent: {
          name: this.config.agentName,
          token: agentToken.token
        }
      };
    } catch (error) {
      this.throwIfDailyApiError(error, 'creating token');
      throw error;
    }
  }

  getDefaultRoomExpireSeconds() {
    return this.config.defaultRoomExpireSeconds;
  }

  getDefaultTokenExpireSeconds() {
    return this.config.defaultTokenExpireSeconds;
  }

  private getDailyClient() {
    if (!this.config.dailyApiKey) {
      throw new HttpError(503, 'Voice service is not configured. Set DAILY_API_KEY.');
    }

    return new DailyApiClient(this.config.dailyApiUrl, this.config.dailyApiKey);
  }

  private throwIfDailyApiError(error: unknown, action: string) {
    if (isDailyApiError(error)) {
      throw new HttpError(502, `Daily API error while ${action}: ${error.message}`);
    }
  }
}
