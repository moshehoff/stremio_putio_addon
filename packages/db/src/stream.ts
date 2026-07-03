import { NotFoundError } from '@putio-stremio/shared';
import { prisma } from './client.js';
import { getDefaultUser } from './parse.js';
import { requireLibraryUser } from './library-user.js';

export interface ResolvedPutioFile {
  putioFileId: number;
  parentId: number;
  name: string;
  contentType: string;
  size: bigint;
  notWebReady: boolean;
}

export async function resolveVideoToPutioFile(
  videoId: string,
  userId?: string,
): Promise<ResolvedPutioFile> {
  const user = await requireLibraryUser(userId);

  const media = await prisma.media.findFirst({
    where: {
      userId: user.id,
      stremioId: videoId,
    },
    include: {
      files: {
        take: 1,
        orderBy: { size: 'desc' },
      },
    },
  });

  if (!media || media.files.length === 0) {
    throw new NotFoundError('Video not found in library');
  }

  const file = media.files[0]!;

  return {
    putioFileId: file.putioFileId,
    parentId: file.parentId,
    name: file.name,
    contentType: file.contentType,
    size: file.size,
    notWebReady: isNotWebReady(file.name, file.contentType),
  };
}

function isNotWebReady(name: string, contentType: string): boolean {
  const lowerName = name.toLowerCase();
  if (lowerName.endsWith('.mp4')) {
    return false;
  }
  if (contentType === 'video/mp4') {
    return false;
  }
  return true;
}
