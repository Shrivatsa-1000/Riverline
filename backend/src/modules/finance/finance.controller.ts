import type { FastifyReply, FastifyRequest } from 'fastify';
import { sendControllerError } from '../../lib/controller-error';
import type { FinancialStateQuery, StepperQuery } from '../../schemas/finance.schemas';
import type { FinancialIntakeService } from './financial-intake.service';

export class FinanceController {
  constructor(private readonly financialIntakeService: FinancialIntakeService) {}

  getStepper = async (request: FastifyRequest, reply: FastifyReply) => {
    const query = request.query as StepperQuery;

    try {
      const stepper = await this.financialIntakeService.getStepperConfig(query.userName ?? 'Ankit');
      return reply.code(200).send(stepper);
    } catch (error) {
      return sendControllerError(request, reply, error, 'Failed to load stepper');
    }
  };

  getFinancialState = async (request: FastifyRequest, reply: FastifyReply) => {
    const query = request.query as FinancialStateQuery;

    try {
      const state = await this.financialIntakeService.getFinancialState(query.userName ?? 'Ankit');
      return reply.code(200).send({ state });
    } catch (error) {
      return sendControllerError(request, reply, error, 'Failed to load financial state');
    }
  };
}
