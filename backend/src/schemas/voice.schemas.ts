import { z } from 'zod';

export const createVoiceRoomBodySchema = z
  .object({
    roomName: z.string().trim().min(1).max(120).optional(),
    expiresInSeconds: z.coerce.number().int().min(60).max(86_400).optional()
  })
  .strict();

export const createVoiceTokenBodySchema = z
  .object({
    roomName: z.string().trim().min(1).max(120),
    userName: z.string().trim().min(1).max(120),
    expiresInSeconds: z.coerce.number().int().min(60).max(86_400).optional()
  })
  .strict();

export const createVoiceSessionBodySchema = z
  .object({
    userName: z.string().trim().min(1).max(120),
    roomExpiresInSeconds: z.coerce.number().int().min(60).max(86_400).optional(),
    tokenExpiresInSeconds: z.coerce.number().int().min(60).max(86_400).optional()
  })
  .strict();

export type CreateVoiceRoomBody = z.infer<typeof createVoiceRoomBodySchema>;
export type CreateVoiceTokenBody = z.infer<typeof createVoiceTokenBodySchema>;
export type CreateVoiceSessionBody = z.infer<typeof createVoiceSessionBodySchema>;
