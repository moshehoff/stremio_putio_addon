import {
  buildEpisodeFileStremioId,
  resolveMediaWithFolderFallback,
  type ParsedMedia,
} from '@putio-stremio/media-parser';
import { createLogger } from '@putio-stremio/shared';
import { prisma } from './client.js';
import { getFolderName } from './folders.js';

const log = createLogger('parser');

export interface ParseResult {
  filesProcessed: number;
  mediaUpserted: number;
  episodes: number;
  movies: number;
  unmatched: number;
  skipped: number;
}

export interface ParseOptions {
  onlyDbFileIds?: string[];
}

function resolveMetadataStatus(
  parsed: ParsedMedia,
  existing: {
    kind: string;
    title: string;
    seriesKey: string | null;
    year: number | null;
    metadataStatus: string;
    posterPath: string | null;
  } | null,
): string {
  if (!existing) {
    return parsed.kind === 'unmatched' ? 'unknown' : 'pending';
  }

  const identityChanged =
    existing.kind !== parsed.kind ||
    existing.title !== parsed.title ||
    existing.seriesKey !== (parsed.seriesKey ?? null) ||
    existing.year !== (parsed.year ?? null);

  if (identityChanged) {
    return parsed.kind === 'unmatched' ? 'unknown' : 'pending';
  }

  if (existing.metadataStatus === 'matched' || existing.metadataStatus === 'failed') {
    return existing.metadataStatus;
  }

  return parsed.kind === 'unmatched' ? 'unknown' : 'pending';
}

async function upsertParsedFile(
  userId: string,
  file: {
    id: string;
    putioFileId: number;
    name: string;
    parentId: number;
    mediaId: string | null;
  },
): Promise<{ kind: ParsedMedia['kind']; upserted: boolean }> {
  const parentFolderName =
    file.parentId > 0 ? await getFolderName(userId, file.parentId) : null;
  const parsed = resolveMediaWithFolderFallback(file.name, parentFolderName);
  const existingMedia = file.mediaId
    ? await prisma.media.findUnique({ where: { id: file.mediaId } })
    : null;

  let stremioId: string;
  let seriesKey: string | null = null;
  let season: number | null = null;
  let episode: number | null = null;

  if (parsed.kind === 'episode' && parsed.seriesKey && parsed.season && parsed.episode) {
    stremioId = buildEpisodeFileStremioId(file.putioFileId);
    seriesKey = parsed.seriesKey;
    season = parsed.season;
    episode = parsed.episode;
  } else if (parsed.kind === 'movie') {
    stremioId = `putio:movie:${file.putioFileId}`;
    seriesKey = parsed.seriesKey ?? null;
  } else {
    stremioId = `putio:raw:${file.putioFileId}`;
  }

  const metadataStatus = resolveMetadataStatus(parsed, existingMedia);

  const media = await prisma.media.upsert({
    where: {
      userId_stremioId: {
        userId,
        stremioId,
      },
    },
    create: {
      userId,
      kind: parsed.kind,
      title: parsed.title,
      stremioId,
      seriesKey,
      season,
      episode,
      year: parsed.year ?? null,
      resolution: parsed.resolution ?? null,
      metadataStatus,
    },
    update: {
      title: parsed.title,
      seriesKey,
      season,
      episode,
      year: parsed.year ?? null,
      resolution: parsed.resolution ?? null,
      metadataStatus,
    },
  });

  await prisma.putioFile.update({
    where: { id: file.id },
    data: { mediaId: media.id },
  });

  return { kind: parsed.kind, upserted: true };
}

export async function parseMediaForUser(
  userId: string,
  options: ParseOptions = {},
): Promise<ParseResult> {
  const files = await prisma.putioFile.findMany({
    where: {
      userId,
      ...(options.onlyDbFileIds
        ? { id: { in: options.onlyDbFileIds } }
        : {}),
    },
    orderBy: { putioCreatedAt: 'desc' },
  });

  let mediaUpserted = 0;
  let episodes = 0;
  let movies = 0;
  let unmatched = 0;
  let skipped = 0;

  for (const file of files) {
    const result = await upsertParsedFile(userId, file);
    if (!result.upserted) {
      skipped += 1;
      continue;
    }

    mediaUpserted += 1;
    if (result.kind === 'episode') {
      episodes += 1;
    } else if (result.kind === 'movie') {
      movies += 1;
    } else {
      unmatched += 1;
    }
  }

  if (!options.onlyDbFileIds) {
    await prisma.media.deleteMany({
      where: { userId, files: { none: {} } },
    });
    await cleanupStaleSeriesMeta(userId);
  }

  log.info(
    {
      userId,
      filesProcessed: files.length,
      episodes,
      movies,
      unmatched,
      skipped,
      partial: Boolean(options.onlyDbFileIds),
    },
    'Media parsing completed',
  );

  return {
    filesProcessed: files.length,
    mediaUpserted,
    episodes,
    movies,
    unmatched,
    skipped,
  };
}

export async function cleanupStaleSeriesMeta(userId: string): Promise<number> {
  const activeSeries = await prisma.media.findMany({
    where: {
      userId,
      kind: 'episode',
      seriesKey: { not: null },
    },
    select: { seriesKey: true },
    distinct: ['seriesKey'],
  });

  const activeKeys = activeSeries
    .map((row) => row.seriesKey)
    .filter((key): key is string => Boolean(key));

  const removed = await prisma.seriesMeta.deleteMany({
    where: {
      userId,
      ...(activeKeys.length > 0
        ? { seriesKey: { notIn: activeKeys } }
        : {}),
    },
  });

  return removed.count;
}

export async function getDefaultUser() {
  return prisma.user.findFirst({
    where: { slug: 'default' },
    orderBy: { createdAt: 'asc' },
  });
}

export async function getUserBySlug(slug: string) {
  return prisma.user.findUnique({
    where: { slug },
  });
}
