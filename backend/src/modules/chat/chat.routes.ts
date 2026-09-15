import type { FastifyInstance } from 'fastify';
import { validateRequest } from '../../middlewares/validate';
import {
  appendMessageBodySchema,
  chatParamsSchema,
  createChatBodySchema,
  listChatsQuerySchema,
  listMessagesQuerySchema
} from '../../schemas/chat.schemas';
import { ChatController } from './chat.controller';

type AnyFastify = FastifyInstance<any, any, any, any>;

interface ChatRoutesDeps {
  controller: ChatController;
}

export async function registerChatRoutes(app: AnyFastify, deps: ChatRoutesDeps) {
  app.post('/api/chats', {
    preHandler: [validateRequest('body', createChatBodySchema)]
  }, deps.controller.createChat);

  app.get('/api/chats', {
    preHandler: [validateRequest('query', listChatsQuerySchema)]
  }, deps.controller.listChats);

  app.get('/api/chats/:chatId/messages', {
    preHandler: [validateRequest('params', chatParamsSchema), validateRequest('query', listMessagesQuerySchema)]
  }, deps.controller.listMessages);

  app.post('/api/chats/:chatId/messages', {
    preHandler: [validateRequest('params', chatParamsSchema), validateRequest('body', appendMessageBodySchema)]
  }, deps.controller.appendMessage);
}
