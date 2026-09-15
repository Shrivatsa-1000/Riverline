import type { VoiceSessionResponse } from '../types/voice';
import { getApiBaseUrl } from './apiBaseUrl';
import { httpJson } from './httpJson';

export async function createOrRefreshVoiceSession(userName: string): Promise<VoiceSessionResponse> {
  const payload = await httpJson<unknown>(
    `${getApiBaseUrl()}/api/voice/session`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ userName })
    },
    {
      fallbackError: 'Unable to create voice session'
    }
  );

  if (!payload || typeof payload !== 'object') {
    throw new Error('Voice session payload is invalid');
  }

  return payload as VoiceSessionResponse;
}
