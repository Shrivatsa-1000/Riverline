import { z } from 'zod';

export const createChatBodySchema = z
  .object({
    userName: z.string().trim().min(1).max(120).optional(),
    reuseLatest: z.coerce.boolean().optional(),
    historyLimit: z.coerce.number().int().min(1).max(500).optional()
  })
  .strict();

export const listChatsQuerySchema = z
  .object({
    limit: z.coerce.number().int().min(1).max(100).optional()
  })
  .strict();

export const chatParamsSchema = z
  .object({
    chatId: z.string().length(24)
  })
  .strict();

export const listMessagesQuerySchema = z
  .object({
    limit: z.coerce.number().int().min(1).max(200).optional(),
    beforeMessageId: z.string().length(24).optional()
  })
  .strict();

export const appendMessageBodySchema = z
  .object({
    senderRole: z.enum(['user', 'agent']),
    senderName: z.string().trim().min(1).max(120).optional(),
    content: z.string().trim().min(1).max(8000)
  })
  .strict();

export type CreateChatBody = z.infer<typeof createChatBodySchema>;
export type ListChatsQuery = z.infer<typeof listChatsQuerySchema>;
export type ChatParams = z.infer<typeof chatParamsSchema>;
export type ListMessagesQuery = z.infer<typeof listMessagesQuerySchema>;
export type AppendMessageBody = z.infer<typeof appendMessageBodySchema>;
