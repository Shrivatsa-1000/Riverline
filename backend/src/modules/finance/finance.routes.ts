import type { FastifyInstance } from 'fastify';
import { validateRequest } from '../../middlewares/validate';
import { stepperQuerySchema } from '../../schemas/finance.schemas';
import { FinanceController } from './finance.controller';

type AnyFastify = FastifyInstance<any, any, any, any>;

interface FinanceRoutesDeps {
  controller: FinanceController;
}

export async function registerFinanceRoutes(app: AnyFastify, deps: FinanceRoutesDeps) {
  app.get('/api/stepper', {
    preHandler: [validateRequest('query', stepperQuerySchema)]
  }, deps.controller.getStepper);

  app.get('/api/financial-state', {
    preHandler: [validateRequest('query', stepperQuerySchema)]
  }, deps.controller.getFinancialState);
}
