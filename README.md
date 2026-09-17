Edit : the open ai endpoint needs to an websocket endpoint forgot to mention this too. 

- Edit : Sorry added readme late

- the voice agent takes instructions priorities things tells you summaries and basic things about your budget then it adds edits delete items too. And the dashboard edits things in realtime. 
# Riverline

Voice-first financial intake app with:
- `frontend` (React + TypeScript)
- `backend` (Fastify + TypeScript)
- `mongodb` (chat + financial state storage)
- `pipecat` worker container

## Docker Setup (one command)

### 1) Create environment file
From repo root:

```bash
cp backend/.env.example backend/.env
```

Update `backend/.env` with your real keys before starting.

### 2) Start everything

```bash
docker compose up --build
```

This starts:
- `mongodb`
- `backend`
- `frontend`
- `pipecat`

### 3) Stop

```bash
docker compose down
```

To also remove DB volume:

```bash
docker compose down -v
```

## Local Web Addresses

- Frontend: `http://localhost:5173`
- Backend API: `http://localhost:3000`
- Backend health: `http://localhost:3000/health`
- MongoDB: `mongodb://localhost:27017`

## Environment Variables

Set these in `backend/.env`.

### Required for full voice + agent flow
- `OPENAI_API_KEY`
- `DAILY_API_KEY`

### Commonly used
- `OPENAI_BASE_URL` (default: Azure/OpenAI base URL from `.env.example`)
- `OPENAI_MODEL` (default: `gpt-realtime-2.1-mini`)
- `AGENT_NAME` (default: `Paisa`)
- `MONGODB_URI` (compose overrides to `mongodb://mongodb:27017` inside containers)
- `MONGODB_DB_NAME` (default: `riverline`)
- `CORS_ORIGINS` (default: `http://localhost:5173`)
- `DAILY_API_URL` (default: `https://api.daily.co/v1`)
- `DAILY_ROOM_EXPIRE_SECONDS` (default: `3600`)
- `DAILY_TOKEN_EXPIRE_SECONDS` (default: `1800`)
- `PIPECAT_BOT_NAME` (default: `paisa-voice-agent`)
- `PIPECAT_LOG_LEVEL` (default: `info`)

### Frontend API URL (Docker build arg)
Compose uses:
- `VITE_API_BASE_URL` (default: `http://localhost:3000`)

If needed, you can override at run time:

```bash
VITE_API_BASE_URL=http://localhost:3000 docker compose up --build
```

## Notes

- Do **not** commit real secrets in `.env`.
- `frontend/.env.example` is useful for non-Docker local frontend runs.
