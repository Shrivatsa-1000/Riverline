import type { FastifyReply, FastifyRequest } from 'fastify';
import type { ZodType } from 'zod';

export type RequestPart = 'body' | 'query' | 'params';

interface MutableBodyRequest extends FastifyRequest {
  body: unknown;
}

interface MutableQueryRequest extends FastifyRequest {
  query: unknown;
}

interface MutableParamsRequest extends FastifyRequest {
  params: unknown;
}

function getSafeInput(request: FastifyRequest, part: RequestPart): unknown {
  if (part === 'body') {
    return (request as MutableBodyRequest).body ?? {};
  }

  if (part === 'query') {
    return (request as MutableQueryRequest).query ?? {};
  }

  const rawValue = (request as MutableParamsRequest).params;

  if (rawValue == null) {
    return {};
  }

  return rawValue;
}

function setParsedInput(request: FastifyRequest, part: RequestPart, value: unknown) {
  if (part === 'body') {
    (request as MutableBodyRequest).body = value;
    return;
  }

  if (part === 'query') {
    (request as MutableQueryRequest).query = value;
    return;
  }

  (request as MutableParamsRequest).params = value;
}

export function validateRequest<T>(part: RequestPart, schema: ZodType<T>) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const input = getSafeInput(request, part);
    const result = schema.safeParse(input);

    if (result.success) {
      setParsedInput(request, part, result.data);
      return;
    }

    const details = result.error.issues.map((issue) => ({
      field: issue.path.join('.') || 'input',
      message: issue.message
    }));

    return reply.code(400).send({
      error: 'Validation failed',
      details
    });
  };
}
