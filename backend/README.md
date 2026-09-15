# Backend (Fastify + TypeScript)

Simple, clean chat backend for Riverline.

## Run locally

1. Install dependencies:

```bash
npm install
```

2. Copy env:

```bash
cp .env.example .env
```

3. Start MongoDB in Docker:

```bash
docker compose up -d mongodb
```

4. Start Pipecat worker in Docker:

```bash
docker compose up -d pipecat
```

5. Run backend:

```bash
npm run dev
```

## Build

```bash
npm run build
```

## API (chat)

- `POST /api/chats` - create chat
- `GET /api/chats` - list chats
- `GET /api/chats/:chatId/messages` - list chat messages
- `POST /api/chats/:chatId/messages` - add chat message

## API (agent)

- `POST /api/agent/reply` - generate a text reply from OpenAI agent

### `POST /api/agent/reply` body

```json
{
  "message": "How should I prioritize my debts this month?",
  "userName": "Ankit",
  "conversationId": "voice-session-1"
}
```

## API (voice setup)

- `POST /api/voice/session` - get or create room for user + issue fresh tokens
- `POST /api/voice/room` - create a private Daily room
- `POST /api/voice/token` - issue short-lived tokens for user + Paisa bot

### `POST /api/voice/session` body

```json
{
  "userName": "Ankit",
  "roomExpiresInSeconds": 3600,
  "tokenExpiresInSeconds": 1800
}
```

### `POST /api/voice/room` body

```json
{
  "roomName": "riverline-demo",
  "expiresInSeconds": 3600
}
```

### `POST /api/voice/token` body

```json
{
  "roomName": "riverline-demo",
  "userName": "Ankit",
  "expiresInSeconds": 1800
}
```

## Notes

- Logging uses `pino`
- Request validation uses `zod`
- Pipecat worker runs as a separate Docker service (`pipecat`)
- Daily room/token APIs require `DAILY_API_KEY`
- OpenAI agent uses `OPENAI_BASE_URL`, `OPENAI_MODEL`, `OPENAI_API_KEY`
- Agent voice output can be configured with `OPENAI_VOICE`, `OPENAI_AUDIO_FORMAT`

## Pipecat service commands

```bash
npm run agent:up
npm run agent:logs
npm run agent:down
```

## Collections and indexes

### `users`
- Unique index: `{ nameKey: 1 }`

### `chats`
- Index: `{ userId: 1, updatedAt: -1 }`
- Index: `{ updatedAt: -1 }`

### `chat_messages`
- Index: `{ chatId: 1, createdAt: 1 }`
- Index: `{ chatId: 1, _id: -1 }`

### `voice_sessions`
- Unique index: `{ userNameKey: 1 }`
- TTL index: `{ roomExpiresAt: 1 }`
- Index: `{ updatedAt: -1 }`

This keeps chat read/write fast and simple.
