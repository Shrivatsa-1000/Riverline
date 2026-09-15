import { z } from 'zod';

export const agentReplyBodySchema = z
  .object({
    message: z.string().trim().min(1).max(8000),
    userName: z.string().trim().min(1).max(120),
    source: z.enum(['voice', 'chat', 'manual']).optional(),
    conversationId: z.string().trim().min(1).max(120).optional()
  })
  .strict();

export const agentOpenSessionBodySchema = z
  .object({
    userName: z.string().trim().min(1).max(120),
    conversationId: z.string().trim().min(1).max(120).optional()
  })
  .strict();

export type AgentReplyBody = z.infer<typeof agentReplyBodySchema>;
export type AgentOpenSessionBody = z.infer<typeof agentOpenSessionBodySchema>;
