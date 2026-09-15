import type { FastifyInstance } from 'fastify';
import { validateRequest } from '../../middlewares/validate';
import {
  createVoiceRoomBodySchema,
  createVoiceSessionBodySchema,
  createVoiceTokenBodySchema
} from '../../schemas/voice.schemas';
import { VoiceController } from './voice.controller';

type AnyFastify = FastifyInstance<any, any, any, any>;

interface VoiceRoutesDeps {
  controller: VoiceController;
}

export async function registerVoiceRoutes(app: AnyFastify, deps: VoiceRoutesDeps) {
  app.post('/api/voice/session', {
    preHandler: [validateRequest('body', createVoiceSessionBodySchema)]
  }, deps.controller.createSession);

  app.post('/api/voice/room', {
    preHandler: [validateRequest('body', createVoiceRoomBodySchema)]
  }, deps.controller.createRoom);

  app.post('/api/voice/token', {
    preHandler: [validateRequest('body', createVoiceTokenBodySchema)]
  }, deps.controller.createToken);
}
