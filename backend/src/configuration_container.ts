import { config as loadEnv } from 'dotenv';
import { z } from 'zod';

loadEnv();

function parseCsv(value: string) {
  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

const envSchema = z.object({
  NODE_ENV: z.string().default('development'),
  HOST: z.string().default('0.0.0.0'),
  PORT: z.coerce.number().int().positive().default(3000),
  LOG_LEVEL: z.string().default('info'),

  CORS_ORIGINS: z
    .string()
    .default('http://localhost:5173')
    .transform((value) => parseCsv(value)),

  MONGODB_URI: z.string().min(1).default('mongodb://localhost:27017'),
  MONGODB_DB_NAME: z.string().min(1).default('riverline'),

  AGENT_NAME: z.string().min(1).default('Paisa'),

  OPENAI_API_KEY: z.string().optional(),
  OPENAI_BASE_URL: z.string().url().default('https://smarthelio-agents-resource.openai.azure.com/openai/v1'),
  OPENAI_MODEL: z.string().min(1).default('gpt-realtime-2.1-mini'),

  DAILY_API_KEY: z.string().optional(),
  DAILY_API_URL: z.string().url().default('https://api.daily.co/v1'),
  DAILY_ROOM_EXPIRE_SECONDS: z.coerce.number().int().min(60).max(86_400).default(3600),
  DAILY_TOKEN_EXPIRE_SECONDS: z.coerce.number().int().min(60).max(86_400).default(1800)
});

export type AppEnv = z.infer<typeof envSchema>;

export function getEnv(): AppEnv {
  const result = envSchema.safeParse(process.env);

  if (!result.success) {
    const details = result.error.issues
      .map((issue) => `${issue.path.join('.') || 'env'}: ${issue.message}`)
      .join('; ');

    throw new Error(`Invalid environment configuration: ${details}`);
  }

  return result.data;
}
