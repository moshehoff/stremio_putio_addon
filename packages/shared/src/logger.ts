import pino from 'pino';
import { getEnv } from './config.js';

export function createLogger(name: string) {
  const { LOG_LEVEL } = getEnv();
  return pino({
    name,
    level: LOG_LEVEL,
  });
}

export type Logger = ReturnType<typeof createLogger>;
