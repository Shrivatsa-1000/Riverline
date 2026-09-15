import { z } from 'zod';

export const stepperQuerySchema = z
  .object({
    userName: z.string().trim().min(1).max(120).optional()
  })
  .strict();

export type StepperQuery = z.infer<typeof stepperQuerySchema>;
export type FinancialStateQuery = z.infer<typeof stepperQuerySchema>;
