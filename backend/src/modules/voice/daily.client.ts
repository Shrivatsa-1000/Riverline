import { requestWithResilience } from '../../lib/outbound-http';

interface CreatePrivateRoomInput {
  roomName?: string;
  expiresAtUnix: number;
}

interface CreateMeetingTokenInput {
  roomName: string;
  userName: string;
  isOwner: boolean;
  expiresAtUnix: number;
}

class DailyApiError extends Error {
  statusCode: number;

  constructor(message: string, statusCode: number) {
    super(message);
    this.name = 'DailyApiError';
    this.statusCode = statusCode;
  }
}

export interface DailyRoomResult {
  id?: string;
  name: string;
  url: string;
  privacy?: string;
  created_at?: string;
  config?: {
    exp?: number;
  };
}

export interface DailyMeetingTokenResult {
  token: string;
}

function safeJsonParse(rawText: string) {
  if (!rawText.trim()) {
    return null;
  }

  try {
    return JSON.parse(rawText) as unknown;
  } catch {
    return null;
  }
}

export class DailyApiClient {
  private readonly baseUrl: string;

  constructor(
    private readonly apiUrl: string,
    private readonly apiKey: string
  ) {
    this.baseUrl = apiUrl.replace(/\/$/, '');
  }

  async createPrivateRoom(input: CreatePrivateRoomInput): Promise<DailyRoomResult> {
    return this.request<DailyRoomResult>('/rooms', {
      method: 'POST',
      body: {
        name: input.roomName,
        privacy: 'private',
        properties: {
          exp: input.expiresAtUnix,
          start_audio_off: false,
          start_video_off: true,
          enable_chat: true
        }
      }
    });
  }

  async createMeetingToken(input: CreateMeetingTokenInput): Promise<DailyMeetingTokenResult> {
    return this.request<DailyMeetingTokenResult>('/meeting-tokens', {
      method: 'POST',
      body: {
        properties: {
          room_name: input.roomName,
          user_name: input.userName,
          is_owner: input.isOwner,
          exp: input.expiresAtUnix
        }
      }
    });
  }

  private async request<T>(
    path: string,
    input: {
      method: 'GET' | 'POST';
      body?: Record<string, unknown>;
    }
  ): Promise<T> {
    const { response, rawText } = await requestWithResilience({
      url: `${this.baseUrl}${path}`,
      method: input.method,
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json'
      },
      body: input.body ? JSON.stringify(input.body) : undefined,
      timeoutMs: 10_000,
      maxRetries: 2,
      retryDelayMs: 250
    });

    if (!response.ok) {
      throw new DailyApiError(`Daily API request failed (${response.status}): ${rawText}`, response.status);
    }

    if (!rawText.trim()) {
      return {} as T;
    }

    const parsed = safeJsonParse(rawText);

    if (parsed === null) {
      throw new DailyApiError('Daily API returned invalid JSON.', 502);
    }

    return parsed as T;
  }
}

export function isDailyApiError(error: unknown): error is DailyApiError {
  return error instanceof DailyApiError;
}
