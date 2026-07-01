import { buildEpisodeStremioId } from '@putio-stremio/media-parser';
import { NotFoundError } from '@putio-stremio/shared';
import { prisma } from './client.js';
import { getDefaultUser } from './parse.js';
import { parseSeriesStremioId, seriesTitleFromKey } from './catalog.js';

const PLACEHOLDER_POSTER =
  'https://www.strem.io/images/addon_default.png';

export interface StremioVideo {
  id: string;
  title: string;
  season: number;
  episode: number;
  released: string;
  thumbnail?: string;
}

export interface StremioMeta {
  id: string;
  type: 'series' | 'movie';
  name: string;
  poster: string;
  description?: string;
  releaseInfo?: string;
  videos?: StremioVideo[];
}

export async function getSeriesMeta(stremioId: string): Promise<StremioMeta> {
  const seriesKey = parseSeriesStremioId(stremioId);
  if (!seriesKey) {
    throw new NotFoundError('Invalid series id');
  }

  const user = await getDefaultUser();
  if (!user) {
    throw new NotFoundError('No library user');
  }

  const episodes = await prisma.media.findMany({
    where: {
      userId: user.id,
      kind: 'episode',
      seriesKey,
      season: { not: null },
      episode: { not: null },
    },
    orderBy: [{ season: 'asc' }, { episode: 'asc' }],
  });

  if (episodes.length === 0) {
    throw new NotFoundError('Series not found');
  }

  const title = episodes[0]?.title ?? seriesTitleFromKey(seriesKey);

  const videos: StremioVideo[] = episodes.map((item) => ({
    id: buildEpisodeStremioId(seriesKey, item.season!, item.episode!),
    title: `S${pad2(item.season!)}E${pad2(item.episode!)}`,
    season: item.season!,
    episode: item.episode!,
    released: new Date().toISOString(),
  }));

  return {
    id: stremioId,
    type: 'series',
    name: title,
    poster: PLACEHOLDER_POSTER,
    description: `${videos.length} episodes from your Put.io library`,
    videos,
  };
}

export async function getMovieMeta(stremioId: string): Promise<StremioMeta> {
  const user = await getDefaultUser();
  if (!user) {
    throw new NotFoundError('No library user');
  }

  const movie = await prisma.media.findFirst({
    where: {
      userId: user.id,
      stremioId,
      kind: 'movie',
    },
  });

  if (!movie) {
    throw new NotFoundError('Movie not found');
  }

  return {
    id: movie.stremioId,
    type: 'movie',
    name: movie.title,
    poster: PLACEHOLDER_POSTER,
    releaseInfo: movie.year ? String(movie.year) : undefined,
  };
}

function pad2(value: number): string {
  return value.toString().padStart(2, '0');
}
