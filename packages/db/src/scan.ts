import {
  buildContentHash,
  createPutioProvider,
  type PutioFileRecord,
  type PutioProvider,
} from '@putio-stremio/putio-client';
import { createLogger } from '@putio-stremio/shared';
import { prisma } from './client.js';
import { parseMediaForUser, type ParseResult } from './parse.js';
import { syncPutioFolderTree, assignRootFoldersToFiles } from './folders.js';
import {
  getLibrarySummary,
  type LibrarySummary,
} from './library-summary.js';
import { enrichIfConfigured, type EnrichResult } from './enrich.js';

const log = createLogger('indexer');

export interface ScanResult {
  userId: string;
  username: string;
  filesFound: number;
  filesUpserted: number;
  scanRunId: string;
  parse?: ParseResult;
  library?: LibrarySummary;
  enrich?: EnrichResult | null;
}

export interface ScanOptions {
  dryRun?: boolean;
  putioToken: string;
}

export async function scanPutioLibrary(
  options: ScanOptions,
): Promise<ScanResult> {
  const putio = createPutioProvider(options.putioToken);
  const account = await putio.getAccountInfo();
  const user = await upsertUser(account.userId, account.username);

  const scanRun = options.dryRun
    ? null
    : await prisma.scanRun.create({
        data: { userId: user.id, status: 'running' },
      });

  try {
    const files = await putio.listAllFiles({ perPage: 1000, fileTypes: ['VIDEO'] });
    log.info(
      { username: account.username, count: files.length, dryRun: options.dryRun },
      'Put.io scan completed',
    );

    let filesUpserted = 0;
    let parse: ParseResult | undefined;
    let library: LibrarySummary | undefined;
    let enrich: EnrichResult | null | undefined;

    if (!options.dryRun) {
      await removeInvalidPutioFiles(user.id);
      const validFiles = files.filter((file) => file.id > 0);
      if (validFiles.length < files.length) {
        log.warn(
          {
            skipped: files.length - validFiles.length,
          },
          'Skipped Put.io entries with invalid file ids',
        );
      }

      filesUpserted = await persistFiles(user.id, validFiles);
      await syncPutioFolderTree(
        user.id,
        putio,
        validFiles.map((file) => file.parentId),
      );
      await assignRootFoldersToFiles(user.id);
      parse = await parseMediaForUser(user.id);
      library = await getLibrarySummary(user.id);
      enrich = await enrichIfConfigured();
      if (enrich) {
        log.info(
          {
            seriesMatched: enrich.seriesMatched,
            moviesMatched: enrich.moviesMatched,
            unmatchedMatched: enrich.unmatchedMatched,
            moviesSkipped: enrich.moviesSkipped,
            unmatchedSkipped: enrich.unmatchedSkipped,
          },
          'Post-scan metadata enrichment completed',
        );
      }
    }

    if (scanRun) {
      await prisma.scanRun.update({
        where: { id: scanRun.id },
        data: {
          status: 'completed',
          finishedAt: new Date(),
          filesFound: files.length,
          filesUpserted,
        },
      });
    }

    return {
      userId: user.id,
      username: account.username,
      filesFound: files.length,
      filesUpserted,
      scanRunId: scanRun?.id ?? 'dry-run',
      parse,
      library,
      enrich,
    };
  } catch (error) {
    if (scanRun) {
      await prisma.scanRun.update({
        where: { id: scanRun.id },
        data: {
          status: 'failed',
          finishedAt: new Date(),
          errorMessage: error instanceof Error ? error.message : 'Unknown error',
        },
      });
    }
    throw error;
  }
}

async function upsertUser(putioUserId: number, username: string) {
  return prisma.user.upsert({
    where: { putioUserId },
    create: {
      slug: 'default',
      putioUserId,
      putioUsername: username,
    },
    update: {
      putioUsername: username,
    },
  });
}

async function removeInvalidPutioFiles(userId: string) {
  await prisma.putioFile.deleteMany({
    where: { userId, putioFileId: { lte: 0 } },
  });
}

async function persistFiles(userId: string, files: PutioFileRecord[]) {
  let upserted = 0;

  for (const file of files) {
    const contentHash = buildContentHash(file);
    const putioCreatedAt = parsePutioDate(file.createdAt);

    await prisma.putioFile.upsert({
      where: {
        userId_putioFileId: {
          userId,
          putioFileId: file.id,
        },
      },
      create: {
        userId,
        putioFileId: file.id,
        name: file.name,
        size: BigInt(file.size),
        parentId: file.parentId,
        fileType: file.fileType,
        contentType: file.contentType,
        contentHash,
        putioCreatedAt,
      },
      update: {
        name: file.name,
        size: BigInt(file.size),
        parentId: file.parentId,
        fileType: file.fileType,
        contentType: file.contentType,
        contentHash,
        putioCreatedAt,
      },
    });

    upserted += 1;
  }

  return upserted;
}

function parsePutioDate(value: string): Date | null {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export async function verifyPutioConnection(
  putio: PutioProvider,
): Promise<{ username: string; userId: number }> {
  const account = await putio.getAccountInfo();
  return { username: account.username, userId: account.userId };
}
