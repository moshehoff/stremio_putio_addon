import { PutioRateLimitError } from './errors.js';

const RETRYABLE_STATUS = new Set([429, 500, 502, 503, 504]);

export async function withRetry<T>(
  fn: () => Promise<T>,
  options: { maxAttempts?: number; baseDelayMs?: number } = {},
): Promise<T> {
  const maxAttempts = options.maxAttempts ?? 4;
  const baseDelayMs = options.baseDelayMs ?? 500;

  let lastError: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      const status = getStatusCode(error);
      const retryable =
        status !== undefined && RETRYABLE_STATUS.has(status);

      if (!retryable || attempt === maxAttempts) {
        throw error;
      }

      const delay = baseDelayMs * 2 ** (attempt - 1);
      await sleep(delay);
    }
  }

  throw lastError;
}

function getStatusCode(error: unknown): number | undefined {
  if (error instanceof PutioRateLimitError) {
    return 429;
  }

  if (
    typeof error === 'object' &&
    error !== null &&
    'status' in error &&
    typeof (error as { status: unknown }).status === 'number'
  ) {
    return (error as { status: number }).status;
  }

  if (
    typeof error === 'object' &&
    error !== null &&
    'response' in error &&
    typeof (error as { response?: { status?: number } }).response?.status ===
      'number'
  ) {
    return (error as { response: { status: number } }).response.status;
  }

  return undefined;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
