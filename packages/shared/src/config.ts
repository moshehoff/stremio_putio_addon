import './load-env.js';
import { z } from 'zod';
import { ValidationError } from './errors.js';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().positive().default(7000),
  BASE_URL: z
    .string()
    .url()
    .default('http://127.0.0.1:7000')
    .transform((url) => url.replace('://localhost', '://127.0.0.1')),
  PUBLIC_BASE_URL: z
    .string()
    .url()
    .optional()
    .transform((url) => url?.replace('://localhost', '://127.0.0.1')),
  LOG_LEVEL: z
    .enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal'])
    .default('info'),
  DATABASE_URL: z.string().min(1).optional(),
  REDIS_URL: z.string().min(1).optional(),
  PUTIO_TOKEN: z.string().min(1).optional(),
  PUTIO_CLIENT_ID: z.string().optional(),
  PUTIO_CLIENT_SECRET: z.string().optional(),
  TMDB_API_KEY: z.string().optional(),
  SECRET_KEY: z.string().optional(),
  AUTO_SCAN_INTERVAL_MINUTES: z.coerce.number().int().min(0).default(5),
});

export type Env = z.infer<typeof envSchema>;

let cached: Env | undefined;

export function getEnv(): Env {
  if (!cached) {
    cached = envSchema.parse(process.env);
  }
  return cached;
}

export function requirePutioToken(): string {
  const token = getEnv().PUTIO_TOKEN;
  if (!token) {
    throw new Error('PUTIO_TOKEN is required but not set in .env');
  }
  return token;
}

export function requireSecretKey(): string {
  const key = getEnv().SECRET_KEY;
  if (!key) {
    throw new ValidationError(
      'SECRET_KEY is required in .env for stream proxy URLs',
    );
  }
  return key;
}

export function requireTmdbApiKey(): string {
  const key = getEnv().TMDB_API_KEY;
  if (!key) {
    throw new ValidationError('TMDB_API_KEY is required in .env for metadata');
  }
  return key;
}

export function resetEnvForTests(): void {
  cached = undefined;
}
