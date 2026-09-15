import pino from 'pino';
import type { AppEnv } from '../configuration_container';

export function createLogger(env: AppEnv) {
  return pino({
    level: env.LOG_LEVEL,
    base: {
      service: 'riverline-backend'
    }
  });
}
