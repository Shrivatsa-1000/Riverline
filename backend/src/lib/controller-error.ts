import type { FastifyReply, FastifyRequest } from 'fastify';
import { isHttpError } from './http-error';

export function sendControllerError(
  request: FastifyRequest,
  reply: FastifyReply,
  error: unknown,
  defaultMessage: string
) {
  request.log.error(
    {
      err: error,
      method: request.method,
      url: request.url
    },
    defaultMessage
  );

  if (isHttpError(error)) {
    return reply.code(error.statusCode).send({ error: error.message });
  }

  return reply.code(500).send({ error: defaultMessage });
}
