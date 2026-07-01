import {
  PutioAuthError,
  PutioFileNotFoundError,
  PutioRateLimitError,
} from './errors.js';
import { withRetry } from './retry.js';
import type {
  ListAllFilesOptions,
  PaginatedFiles,
  PutioAccountInfo,
  PutioFileRecord,
  PutioSubtitleRecord,
} from './types.js';

const PUTIO_API_BASE = 'https://api.put.io/v2';

type RawPutioFile = {
  id: number;
  name: string;
  size: number;
  parent_id: number;
  file_type: string;
  content_type: string;
  created_at: string;
  crc32?: string;
};

type ListResponse = {
  files?: RawPutioFile[];
  cursor?: string | null;
  total?: number | null;
};

type PutioErrorBody = {
  error_type?: string;
  error_message?: string;
};

type RawSubtitle = {
  key: string;
  language: string;
  name: string;
  source: string;
};

export interface PutioProvider {
  getAccountInfo(): Promise<PutioAccountInfo>;
  listAllFiles(options?: ListAllFilesOptions): Promise<PutioFileRecord[]>;
  listFilesPage(options: {
    cursor?: string;
    perPage: number;
    fileTypes?: string[];
  }): Promise<PaginatedFiles>;
  getDownloadUrl(fileId: number): Promise<string>;
  listSubtitles(fileId: number): Promise<PutioSubtitleRecord[]>;
  getSubtitleContent(
    fileId: number,
    key: string,
    format?: 'webvtt' | 'srt',
  ): Promise<string>;
}

export function createPutioProvider(token: string): PutioProvider {
  const client = new PutioHttpClient(token);

  return {
    getAccountInfo: () => withRetry(() => client.getAccountInfo()),
    listAllFiles: (options) => withRetry(() => client.listAllFiles(options)),
    listFilesPage: (options) => withRetry(() => client.listFilesPage(options)),
    getDownloadUrl: (fileId) => withRetry(() => client.getDownloadUrl(fileId)),
    listSubtitles: (fileId) => withRetry(() => client.listSubtitles(fileId)),
    getSubtitleContent: (fileId, key, format) =>
      withRetry(() => client.getSubtitleContent(fileId, key, format)),
  };
}

class PutioHttpClient {
  constructor(private readonly token: string) {}

  async getAccountInfo(): Promise<PutioAccountInfo> {
    const data = await this.get<{ info: { user_id: number; username: string; mail: string } }>(
      '/account/info',
    );

    if (!data.info?.user_id || !data.info.username) {
      throw new PutioAuthError('Invalid account info response from Put.io');
    }

    return {
      userId: data.info.user_id,
      username: data.info.username,
      email: data.info.mail ?? '',
    };
  }

  async listAllFiles(options: ListAllFilesOptions = {}): Promise<PutioFileRecord[]> {
    const perPage = options.perPage ?? 1000;
    const fileTypes = options.fileTypes ?? ['VIDEO'];
    const all: PutioFileRecord[] = [];
    let cursor: string | undefined;

    do {
      const page = await this.listFilesPage({ cursor, perPage, fileTypes });
      all.push(...page.files);
      cursor = page.cursor ?? undefined;
    } while (cursor);

    return all;
  }

  async listFilesPage(options: {
    cursor?: string;
    perPage: number;
    fileTypes?: string[];
  }): Promise<PaginatedFiles> {
    const fileType = options.fileTypes?.[0] ?? 'VIDEO';

    const data = options.cursor
      ? await this.post<ListResponse>('/files/list/continue', {
          cursor: options.cursor,
          per_page: options.perPage,
        })
      : await this.get<ListResponse>('/files/list', {
          parent_id: -1,
          per_page: options.perPage,
          file_type: fileType,
        });

    return {
      files: (data.files ?? []).map(mapPutioFile),
      cursor: data.cursor ?? null,
      total: data.total ?? null,
    };
  }

  async getDownloadUrl(fileId: number): Promise<string> {
    const data = await this.get<{ url?: string }>(`/files/${fileId}/url`);
    if (!data.url) {
      throw new PutioFileNotFoundError(fileId);
    }
    return data.url;
  }

  async listSubtitles(fileId: number): Promise<PutioSubtitleRecord[]> {
    const data = await this.get<{ subtitles?: RawSubtitle[] }>(
      `/files/${fileId}/subtitles`,
    );
    return (data.subtitles ?? []).map((sub) => ({
      key: sub.key,
      language: sub.language,
      name: sub.name,
      source: sub.source,
    }));
  }

  async getSubtitleContent(
    fileId: number,
    key: string,
    format: 'webvtt' | 'srt' = 'webvtt',
  ): Promise<string> {
    const url = new URL(`${PUTIO_API_BASE}/files/${fileId}/subtitles/${key}`);
    url.searchParams.set('format', format);

    const response = await fetch(url, {
      headers: this.headers(),
    });

    if (response.status === 401 || response.status === 403) {
      throw new PutioAuthError();
    }
    if (response.status === 404) {
      throw new PutioFileNotFoundError(fileId);
    }
    if (!response.ok) {
      throw new Error(`Put.io subtitle request failed: ${response.status}`);
    }

    return response.text();
  }

  private async get<T>(
    path: string,
    params?: Record<string, string | number>,
  ): Promise<T> {
    const url = new URL(`${PUTIO_API_BASE}${path}`);
    if (params) {
      for (const [key, value] of Object.entries(params)) {
        url.searchParams.set(key, String(value));
      }
    }

    const response = await fetch(url, {
      headers: this.headers(),
    });

    return this.parseResponse<T>(response);
  }

  private async post<T>(
    path: string,
    body: Record<string, string | number>,
  ): Promise<T> {
    const response = await fetch(`${PUTIO_API_BASE}${path}`, {
      method: 'POST',
      headers: {
        ...this.headers(),
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams(
        Object.fromEntries(
          Object.entries(body).map(([key, value]) => [key, String(value)]),
        ),
      ),
    });

    return this.parseResponse<T>(response);
  }

  private headers(): Record<string, string> {
    return {
      Authorization: `token ${this.token}`,
      Accept: 'application/json',
    };
  }

  private async parseResponse<T>(response: Response): Promise<T> {
    if (response.status === 401 || response.status === 403) {
      throw new PutioAuthError();
    }
    if (response.status === 404) {
      throw new PutioFileNotFoundError(-1);
    }
    if (response.status === 429) {
      throw new PutioRateLimitError();
    }
    if (!response.ok) {
      const body = (await response.json().catch(() => ({}))) as PutioErrorBody;
      throw new Error(
        body.error_message ?? `Put.io request failed with status ${response.status}`,
      );
    }

    return (await response.json()) as T;
  }
}

function mapPutioFile(file: RawPutioFile): PutioFileRecord {
  return {
    id: file.id,
    name: file.name,
    size: file.size,
    parentId: file.parent_id,
    fileType: file.file_type,
    contentType: file.content_type,
    createdAt: file.created_at,
    crc32: file.crc32,
  };
}
