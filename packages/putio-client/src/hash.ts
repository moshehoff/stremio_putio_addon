import { createHash } from 'node:crypto';
import type { PutioFileRecord } from '@putio-stremio/putio-client';

export function buildContentHash(
  file: Pick<PutioFileRecord, 'id' | 'name' | 'size' | 'crc32'>,
): string {
  const raw = `${file.id}:${file.name}:${file.size}:${file.crc32 ?? ''}`;
  return createHash('sha256').update(raw).digest('hex');
}
