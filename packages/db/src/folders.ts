import type { PutioProvider } from '@putio-stremio/putio-client';
import { PutioFileNotFoundError } from '@putio-stremio/putio-client';
import { createLogger } from '@putio-stremio/shared';
import { prisma } from './client.js';

const log = createLogger('folders');

export function computeRootFolderId(
  folderId: number,
  parentMap: Map<number, number>,
): number {
  if (folderId <= 0) {
    return 0;
  }

  let current = folderId;
  for (let depth = 0; depth < 24; depth += 1) {
    const parent = parentMap.get(current);
    if (parent === undefined || parent <= 0) {
      return current;
    }
    current = parent;
  }

  return current;
}

async function upsertFolderRecord(
  userId: string,
  putioFolderId: number,
  name: string,
  parentFolderId: number,
): Promise<void> {
  await prisma.putioFolder.upsert({
    where: {
      userId_putioFolderId: {
        userId,
        putioFolderId,
      },
    },
    create: {
      userId,
      putioFolderId,
      parentFolderId,
      name,
    },
    update: {
      parentFolderId,
      name,
    },
  });
}

export async function syncPutioFolderTree(
  userId: string,
  putio: PutioProvider,
  parentIds: number[],
): Promise<void> {
  const toVisit = new Set(parentIds.map((id) => (id <= 0 ? 0 : id)));
  const visited = new Set<number>();

  await upsertFolderRecord(userId, 0, 'Your Files', -1);

  while (toVisit.size > 0) {
    const folderId = toVisit.values().next().value as number;
    toVisit.delete(folderId);

    if (visited.has(folderId)) {
      continue;
    }
    visited.add(folderId);

    if (folderId <= 0) {
      continue;
    }

    let name = `Folder ${folderId}`;
    let parentFolderId = 0;

    try {
      const folder = await putio.getFile(folderId);
      name = folder.name || name;
      parentFolderId = folder.parentId <= 0 ? 0 : folder.parentId;
    } catch (error) {
      if (!(error instanceof PutioFileNotFoundError)) {
        throw error;
      }
      log.warn({ folderId }, 'Could not resolve Put.io folder — treating as top-level');
      parentFolderId = 0;
    }

    await upsertFolderRecord(userId, folderId, name, parentFolderId);

    if (parentFolderId > 0) {
      toVisit.add(parentFolderId);
    }
  }
}

/** @deprecated Use syncPutioFolderTree */
export async function syncPutioFolders(
  userId: string,
  putio: PutioProvider,
  parentIds: number[],
): Promise<void> {
  return syncPutioFolderTree(userId, putio, parentIds);
}

export async function assignRootFoldersToFiles(userId: string): Promise<void> {
  const folders = await prisma.putioFolder.findMany({
    where: { userId },
    select: { putioFolderId: true, parentFolderId: true },
  });

  const parentMap = new Map(
    folders.map((folder) => [folder.putioFolderId, folder.parentFolderId]),
  );

  const files = await prisma.putioFile.findMany({
    where: { userId, putioFileId: { gt: 0 } },
    select: { id: true, parentId: true },
  });

  for (const file of files) {
    const startFolderId = file.parentId <= 0 ? 0 : file.parentId;
    const rootFolderId = computeRootFolderId(startFolderId, parentMap);

    await prisma.putioFile.update({
      where: { id: file.id },
      data: { rootFolderId },
    });
  }
}

export async function getFolderName(
  userId: string,
  putioFolderId: number,
): Promise<string> {
  const folder = await prisma.putioFolder.findUnique({
    where: {
      userId_putioFolderId: {
        userId,
        putioFolderId,
      },
    },
  });

  if (folder) {
    return folder.name;
  }

  return putioFolderId === 0 ? 'Your Files' : `Folder ${putioFolderId}`;
}
