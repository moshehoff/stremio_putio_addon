import {
  buildEpisodeFileStremioId,
  parseMediaFilename,
  type ParsedMedia,
} from '@putio-stremio/media-parser';
import { createLogger } from '@putio-stremio/shared';
import { prisma } from './client.js';

const log = createLogger('parser');

export interface ParseResult {
  filesProcessed: number;
  mediaUpserted: number;
  episodes: number;
  movies: number;
  unmatched: number;
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

export async function parseMediaForUser(userId: string): Promise<ParseResult> {
  const files = await prisma.putioFile.findMany({
    where: { userId },
    orderBy: { putioCreatedAt: 'desc' },
  });

  let mediaUpserted = 0;
  let episodes = 0;
  let movies = 0;
  let unmatched = 0;

  for (const file of files) {
    const parsed = parseMediaFilename(file.name);
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
      episodes += 1;
    } else if (parsed.kind === 'movie') {
      stremioId = `putio:movie:${file.putioFileId}`;
      seriesKey = parsed.seriesKey ?? null;
      movies += 1;
    } else {
      stremioId = `putio:raw:${file.putioFileId}`;
      unmatched += 1;
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

    mediaUpserted += 1;
  }

  await prisma.media.deleteMany({
    where: { userId, files: { none: {} } },
  });

  log.info(
    { userId, filesProcessed: files.length, episodes, movies, unmatched },
    'Media parsing completed',
  );

  return {
    filesProcessed: files.length,
    mediaUpserted,
    episodes,
    movies,
    unmatched,
  };
}

export async function getDefaultUser() {
  return prisma.user.findFirst({
    where: { slug: 'default' },
    orderBy: { createdAt: 'asc' },
  });
}
