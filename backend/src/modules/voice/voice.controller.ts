import type { FastifyReply, FastifyRequest } from 'fastify';
import { sendControllerError } from '../../lib/controller-error';
import type {
  CreateVoiceRoomBody,
  CreateVoiceSessionBody,
  CreateVoiceTokenBody
} from '../../schemas/voice.schemas';
import type { VoiceService } from './voice.service';

export class VoiceController {
  constructor(private readonly voiceService: VoiceService) {}

  createSession = async (request: FastifyRequest, reply: FastifyReply) => {
    const body = request.body as CreateVoiceSessionBody;

    try {
      const session = await this.voiceService.createOrRefreshSession({
        userName: body.userName,
        roomExpiresInSeconds: body.roomExpiresInSeconds,
        tokenExpiresInSeconds: body.tokenExpiresInSeconds
      });

      return reply.code(201).send(session);
    } catch (error) {
      return sendControllerError(request, reply, error, 'Failed to create or refresh voice session');
    }
  };

  createRoom = async (request: FastifyRequest, reply: FastifyReply) => {
    const body = request.body as CreateVoiceRoomBody;

    try {
      const room = await this.voiceService.createPrivateRoom({
        roomName: body.roomName,
        expiresInSeconds: body.expiresInSeconds ?? this.voiceService.getDefaultRoomExpireSeconds()
      });

      return reply.code(201).send({ room });
    } catch (error) {
      return sendControllerError(request, reply, error, 'Failed to create room');
    }
  };

  createToken = async (request: FastifyRequest, reply: FastifyReply) => {
    const body = request.body as CreateVoiceTokenBody;

    try {
      const tokens = await this.voiceService.createRoomTokens({
        roomName: body.roomName,
        userName: body.userName,
        expiresInSeconds: body.expiresInSeconds ?? this.voiceService.getDefaultTokenExpireSeconds()
      });

      return reply.code(201).send(tokens);
    } catch (error) {
      return sendControllerError(request, reply, error, 'Failed to create token');
    }
  };
}
