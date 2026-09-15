import type { FastifyReply, FastifyRequest } from 'fastify';
import { sendControllerError } from '../../lib/controller-error';
import type { FinancialIntakeService } from '../finance/financial-intake.service';
import type { AgentOpenSessionBody, AgentReplyBody } from '../../schemas/agent.schemas';
import type { OpenAiAgentService } from './openai-agent.service';

function enforceRupeeCurrency(text: string) {
  return text
    .replace(/\bUS\s*dollars?\b/gi, 'rupees')
    .replace(/\bUSD\b/gi, 'rupees')
    .replace(/\bdollars?\b/gi, 'rupees')
    .replace(/us\$\s*/gi, '₹')
    .replace(/\$\s*(\d[\d,]*(?:\.\d+)?)/g, '₹$1')
    .replace(/\$/g, '₹')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

export class AgentController {
  constructor(
    private readonly openAiAgentService: OpenAiAgentService,
    private readonly financialIntakeService: FinancialIntakeService
  ) {}

  openSession = async (request: FastifyRequest, reply: FastifyReply) => {
    const body = request.body as AgentOpenSessionBody;

    try {
      const opened = await this.financialIntakeService.openConversation(body.userName);
      const generated = await this.generateNaturalReply({
        userName: opened.state.userName,
        draft: opened.replyText,
        conversationId: body.conversationId
      });

      return reply.code(200).send({
        reply: generated.text,
        model: generated.model,
        audioBase64: generated.audioBase64,
        audioMimeType: generated.audioMimeType,
        conversation: opened.state.conversation
      });
    } catch (error) {
      return sendControllerError(request, reply, error, 'Failed to open agent session');
    }
  };

  reply = async (request: FastifyRequest, reply: FastifyReply) => {
    const body = request.body as AgentReplyBody;

    try {
      const turn = await this.financialIntakeService.handleTurn({
        userName: body.userName,
        message: body.message,
        source: body.source ?? 'chat'
      });

      const result = await this.generateNaturalReply({
        userName: turn.state.userName,
        draft: turn.replyText,
        conversationId: body.conversationId
      });

      return reply.code(200).send({
        reply: result.text,
        model: result.model,
        audioBase64: result.audioBase64,
        audioMimeType: result.audioMimeType,
        conversation: turn.state.conversation
      });
    } catch (error) {
      return sendControllerError(request, reply, error, 'Failed to generate agent reply');
    }
  };

  private async generateNaturalReply(input: {
    userName: string;
    draft: string;
    conversationId?: string;
  }) {
    try {
      const response = await this.openAiAgentService.generateReply({
        userName: input.userName,
        conversationId: input.conversationId,
        message: [
          'You are Paisa, a financial intake voice assistant.',
          'Rewrite the following draft into natural spoken English.',
          'Keep it short and crisp.',
          'Always use Indian currency wording: rupees / ₹ only, never dollars or USD.',
          'Return only the final assistant reply text.',
          'Do not mention rewriting, translating, or internal process.',
          'Do not add financial recommendations, products, or schemes.',
          'If draft includes a direct question, keep that question intent unchanged.',
          `Draft: ${input.draft}`
        ].join('\n')
      });

      return {
        ...response,
        text: enforceRupeeCurrency(response.text)
      };
    } catch {
      return {
        text: enforceRupeeCurrency(input.draft),
        model: 'local-fallback',
        raw: null
      };
    }
  }
}
