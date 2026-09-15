import type { FastifyReply, FastifyRequest } from 'fastify';
import { sendControllerError } from '../../lib/controller-error';
import type { AgentReplyBody } from '../../schemas/agent.schemas';
import type { OpenAiAgentService } from './openai-agent.service';

export class AgentController {
  constructor(private readonly openAiAgentService: OpenAiAgentService) {}

  reply = async (request: FastifyRequest, reply: FastifyReply) => {
    const body = request.body as AgentReplyBody;

    try {
      const result = await this.openAiAgentService.generateReply({
        message: body.message,
        userName: body.userName,
        conversationId: body.conversationId
      });

      return reply.code(200).send({
        reply: result.text,
        model: result.model,
        audioBase64: result.audioBase64,
        audioMimeType: result.audioMimeType
      });
    } catch (error) {
      return sendControllerError(request, reply, error, 'Failed to generate agent reply');
    }
  };
}
