import { AppError } from '@putio-stremio/shared';

export class PutioError extends AppError {
  constructor(message: string, code: string, statusCode = 502) {
    super(message, code, statusCode);
    this.name = 'PutioError';
  }
}

export class PutioAuthError extends PutioError {
  constructor(message = 'Put.io authentication failed') {
    super(message, 'PUTIO_AUTH_ERROR', 401);
    this.name = 'PutioAuthError';
  }
}

export class PutioRateLimitError extends PutioError {
  constructor(message = 'Put.io rate limit exceeded') {
    super(message, 'PUTIO_RATE_LIMIT', 429);
    this.name = 'PutioRateLimitError';
  }
}

export class PutioFileNotFoundError extends PutioError {
  constructor(fileId: number) {
    super(`Put.io file not found: ${fileId}`, 'PUTIO_FILE_NOT_FOUND', 404);
    this.name = 'PutioFileNotFoundError';
  }
}
