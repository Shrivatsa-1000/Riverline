export interface VoiceSessionResponse {
  reusedRoom: boolean;
  room: {
    name: string;
    url: string;
    expiresAtUnix: number;
  };
  user: {
    name: string;
    token: string;
  };
  agent: {
    name: string;
    token: string;
  };
  tokenExpiresAtUnix: number;
  session: {
    id: string;
    userName: string;
    roomName: string;
    roomUrl: string;
    roomExpiresAtUnix: number;
    lastTokenExpiresAtUnix: number;
    createdAt: string;
    updatedAt: string;
  };
}
