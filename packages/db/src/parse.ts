import {
  buildEpisodeStremioId,
  parseMediaFilename,
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
    let stremioId: string;
    let seriesKey: string | null = null;
    let season: number | null = null;
    let episode: number | null = null;

    if (parsed.kind === 'episode' && parsed.seriesKey && parsed.season && parsed.episode) {
      stremioId = buildEpisodeStremioId(
        parsed.seriesKey,
        parsed.season,
        parsed.episode,
      );
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
        metadataStatus: parsed.kind === 'unmatched' ? 'unknown' : 'pending',
      },
      update: {
        title: parsed.title,
        seriesKey,
        season,
        episode,
        year: parsed.year ?? null,
        resolution: parsed.resolution ?? null,
      },
    });

    await prisma.putioFile.update({
      where: { id: file.id },
      data: { mediaId: media.id },
    });

    mediaUpserted += 1;
  }

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
