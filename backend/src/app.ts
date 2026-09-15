import cors from '@fastify/cors';
import Fastify from 'fastify';
import type { Db } from 'mongodb';
import type { AppEnv } from './configuration_container';
import { createLogger } from './lib/logger';
import { connectMongo } from './clients/mongo';
import { AgentController } from './modules/agent/agent.controller';
import { registerAgentRoutes } from './modules/agent/agent.routes';
import { OpenAiAgentService } from './modules/agent/openai-agent.service';
import { ChatController } from './modules/chat/chat.controller';
import { ChatRepository } from './modules/chat/chat.repository';
import { registerChatRoutes } from './modules/chat/chat.routes';
import { ChatService } from './modules/chat/chat.service';
import { VoiceController } from './modules/voice/voice.controller';
import { VoiceSessionRepository } from './modules/voice/voice.repository';
import { registerVoiceRoutes } from './modules/voice/voice.routes';
import { VoiceService } from './modules/voice/voice.service';
import { registerHealthRoutes } from './routes/health.routes';

interface AppDependencies {
  chatRepository: ChatRepository;
  voiceSessionRepository: VoiceSessionRepository;
  agentController: AgentController;
  chatController: ChatController;
  voiceController: VoiceController;
}

function buildDependencies(env: AppEnv, mongoDb: Db): AppDependencies {
  const chatRepository = new ChatRepository(mongoDb);
  const voiceSessionRepository = new VoiceSessionRepository(mongoDb);

  const openAiAgentService = new OpenAiAgentService({
    baseUrl: env.OPENAI_BASE_URL,
    apiKey: env.OPENAI_API_KEY,
    model: env.OPENAI_MODEL,
    agentName: env.AGENT_NAME
  });

  const chatService = new ChatService(chatRepository, env.AGENT_NAME);
  const voiceService = new VoiceService(
    {
      dailyApiUrl: env.DAILY_API_URL,
      dailyApiKey: env.DAILY_API_KEY,
      defaultRoomExpireSeconds: env.DAILY_ROOM_EXPIRE_SECONDS,
      defaultTokenExpireSeconds: env.DAILY_TOKEN_EXPIRE_SECONDS,
      agentName: env.AGENT_NAME
    },
    voiceSessionRepository
  );

  return {
    chatRepository,
    voiceSessionRepository,
    agentController: new AgentController(openAiAgentService),
    chatController: new ChatController(chatService),
    voiceController: new VoiceController(voiceService)
  };
}

export async function createApp(env: AppEnv) {
  const logger = createLogger(env);

  const app = Fastify({
    loggerInstance: logger
  });

  await app.register(cors, {
    origin: env.CORS_ORIGINS
  });

  const mongo = await connectMongo(env);
  const dependencies = buildDependencies(env, mongo.db);

  await dependencies.chatRepository.ensureIndexes();
  await dependencies.voiceSessionRepository.ensureIndexes();

  app.addHook('onClose', async () => {
    await mongo.client.close();
  });

  await registerHealthRoutes(app);
  await registerAgentRoutes(app, { controller: dependencies.agentController });

  app.get('/', async () => {
    return {
      message: 'Riverline backend is running'
    };
  });

  await registerChatRoutes(app, { controller: dependencies.chatController });

  await registerVoiceRoutes(app, { controller: dependencies.voiceController });

  return app;
}
