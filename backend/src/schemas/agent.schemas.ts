import { z } from 'zod';

export const agentReplyBodySchema = z
  .object({
    message: z.string().trim().min(1).max(8000),
    userName: z.string().trim().min(1).max(120).optional(),
    conversationId: z.string().trim().min(1).max(120).optional()
  })
  .strict();

export type AgentReplyBody = z.infer<typeof agentReplyBodySchema>;
