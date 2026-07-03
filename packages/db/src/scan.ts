import {
  buildContentHash,
  createPutioProvider,
  PUTIO_LIBRARY_EVENT_TYPES,
  type PutioFileRecord,
  type PutioProvider,
} from '@putio-stremio/putio-client';
import { createLogger } from '@putio-stremio/shared';
import { prisma } from './client.js';
import { cleanupStaleSeriesMeta, parseMediaForUser, type ParseResult } from './parse.js';
import { syncPutioFolderTree, assignRootFoldersToFiles } from './folders.js';
import {
  getLibrarySummary,
  type LibrarySummary,
} from './library-summary.js';
import { enrichIfConfigured, type EnrichResult } from './enrich.js';

const log = createLogger('indexer');

const FULL_SCAN_INTERVAL_MS = 24 * 60 * 60 * 1000;

export interface ScanResult {
  userId: string;
  username: string;
  filesFound: number;
  filesUpserted: number;
  filesRemoved: number;
  filesUnchanged: number;
  scanRunId: string;
  mode: 'full' | 'incremental' | 'noop';
  parse?: ParseResult;
  library?: LibrarySummary;
  enrich?: EnrichResult | null;
}

export interface ScanOptions {
  dryRun?: boolean;
  putioToken: string;
  forceFull?: boolean;
}

export async function scanPutioLibrary(
  options: ScanOptions,
): Promise<ScanResult> {
  return syncPutioLibrary({ ...options, forceFull: true });
}

export async function syncPutioLibrary(
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
    const mode = await resolveScanMode(
      putio,
      user.id,
      user.lastEventId,
      user.lastFullScanAt,
      options.forceFull ?? false,
    );

    if (mode === 'noop' && !options.dryRun) {
      if (scanRun) {
        await prisma.scanRun.update({
          where: { id: scanRun.id },
          data: {
            status: 'completed',
            finishedAt: new Date(),
            filesFound: 0,
            filesUpserted: 0,
          },
        });
      }

      return {
        userId: user.id,
        username: account.username,
        filesFound: 0,
        filesUpserted: 0,
        filesRemoved: 0,
        filesUnchanged: 0,
        scanRunId: scanRun?.id ?? 'dry-run',
        mode: 'noop',
      };
    }

    const files = await putio.listAllFiles({ perPage: 1000, fileTypes: ['VIDEO'] });
    log.info(
      {
        username: account.username,
        count: files.length,
        dryRun: options.dryRun,
        mode,
      },
      'Put.io file list completed',
    );

    let filesUpserted = 0;
    let filesRemoved = 0;
    let filesUnchanged = 0;
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

      const persistResult = await persistFiles(user.id, validFiles, mode === 'full');
      filesUpserted = persistResult.upserted;
      filesUnchanged = persistResult.unchanged;
      filesRemoved = persistResult.removed;

      await syncPutioFolderTree(
        user.id,
        putio,
        validFiles.map((file) => file.parentId),
      );
      await assignRootFoldersToFiles(user.id);

      parse = await parseMediaForUser(user.id, {
        onlyDbFileIds:
          mode === 'incremental' ? persistResult.changedDbFileIds : undefined,
      });

      if (mode === 'full') {
        await cleanupStaleSeriesMeta(user.id);
      }

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

      const events = await putio.listEvents();
      const maxEventId = events.reduce((max, event) => Math.max(max, event.id), 0);

      await prisma.user.update({
        where: { id: user.id },
        data: {
          lastEventId: maxEventId > 0 ? maxEventId : user.lastEventId,
          ...(mode === 'full' ? { lastFullScanAt: new Date() } : {}),
        },
      });
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
      filesRemoved,
      filesUnchanged,
      scanRunId: scanRun?.id ?? 'dry-run',
      mode,
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

async function resolveScanMode(
  putio: PutioProvider,
  userId: string,
  lastEventId: number | null,
  lastFullScanAt: Date | null,
  forceFull: boolean,
): Promise<'full' | 'incremental' | 'noop'> {
  if (forceFull) {
    return 'full';
  }

  const needsFullScan =
    !lastFullScanAt ||
    Date.now() - lastFullScanAt.getTime() >= FULL_SCAN_INTERVAL_MS;

  if (needsFullScan) {
    log.info({ userId }, 'Scheduling full scan (24h fallback)');
    return 'full';
  }

  const events = await putio.listEvents();
  const relevantEvents = events.filter((event) =>
    PUTIO_LIBRARY_EVENT_TYPES.includes(event.type),
  );

  if (relevantEvents.length === 0) {
    return 'noop';
  }

  const newestEventId = Math.max(...relevantEvents.map((event) => event.id));
  if (lastEventId !== null && newestEventId <= lastEventId) {
    return 'noop';
  }

  log.info(
    {
      userId,
      lastEventId,
      newestEventId,
      eventCount: relevantEvents.length,
    },
    'Put.io events detected — running incremental sync',
  );

  return 'incremental';
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

interface PersistResult {
  upserted: number;
  unchanged: number;
  removed: number;
  changedDbFileIds: string[];
}

async function persistFiles(
  userId: string,
  files: PutioFileRecord[],
  pruneMissing: boolean,
): Promise<PersistResult> {
  const existing = await prisma.putioFile.findMany({
    where: { userId, putioFileId: { gt: 0 } },
    select: {
      id: true,
      putioFileId: true,
      contentHash: true,
    },
  });

  const existingByPutioId = new Map(
    existing.map((row) => [row.putioFileId, row]),
  );
  const incomingIds = new Set(files.map((file) => file.id));

  let upserted = 0;
  let unchanged = 0;
  const changedDbFileIds: string[] = [];

  for (const file of files) {
    const contentHash = buildContentHash(file);
    const putioCreatedAt = parsePutioDate(file.createdAt);
    const previous = existingByPutioId.get(file.id);

    if (previous && previous.contentHash === contentHash) {
      unchanged += 1;
      continue;
    }

    const row = await prisma.putioFile.upsert({
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
      select: { id: true },
    });

    changedDbFileIds.push(row.id);
    upserted += 1;
  }

  let removed = 0;
  if (pruneMissing) {
    const staleIds = existing
      .filter((row) => !incomingIds.has(row.putioFileId))
      .map((row) => row.id);

    if (staleIds.length > 0) {
      const result = await prisma.putioFile.deleteMany({
        where: { userId, id: { in: staleIds } },
      });
      removed = result.count;
    }
  }

  return { upserted, unchanged, removed, changedDbFileIds };
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
