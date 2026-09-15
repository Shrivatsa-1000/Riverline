import type { FastifyInstance } from 'fastify';
import { validateRequest } from '../../middlewares/validate';
import { agentReplyBodySchema } from '../../schemas/agent.schemas';
import { AgentController } from './agent.controller';

type AnyFastify = FastifyInstance<any, any, any, any>;

interface AgentRoutesDeps {
  controller: AgentController;
}

export async function registerAgentRoutes(app: AnyFastify, deps: AgentRoutesDeps) {
  app.post('/api/agent/reply', {
    preHandler: [validateRequest('body', agentReplyBodySchema)]
  }, deps.controller.reply);
}
