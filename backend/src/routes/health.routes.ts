import type { FastifyInstance } from 'fastify';

type AnyFastify = FastifyInstance<any, any, any, any>;

export async function registerHealthRoutes(app: AnyFastify) {
  app.get('/health', async () => {
    return {
      status: 'ok'
    };
  });
}
