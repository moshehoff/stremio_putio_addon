import { NotFoundError } from '@putio-stremio/shared';
import { prisma } from './client.js';
import { getDefaultUser } from './parse.js';
import { requireLibraryUser } from './library-user.js';
import { parseSeriesStremioId, seriesTitleFromKey } from './catalog.js';
import { resolveBackdropUrl, resolvePosterUrl, PLACEHOLDER_POSTER } from './posters.js';

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
  background?: string;
  genres?: string[];
  imdb_id?: string;
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

  const seriesMeta = await prisma.seriesMeta.findUnique({
    where: {
      userId_seriesKey: {
        userId: user.id,
        seriesKey,
      },
    },
  });

  const videos: StremioVideo[] = episodes.map((item) => ({
    id: item.stremioId,
    title: `S${pad2(item.season!)}E${pad2(item.episode!)}`,
    season: item.season!,
    episode: item.episode!,
    released: new Date().toISOString(),
  }));

  return {
    id: stremioId,
    type: 'series',
    name: title,
    poster: resolvePosterUrl(seriesMeta?.posterPath),
    background: resolveBackdropUrl(seriesMeta?.backdropPath),
    description:
      seriesMeta?.overview ??
      `${videos.length} episodes from your Put.io library`,
    releaseInfo: seriesMeta?.year ? String(seriesMeta.year) : undefined,
    genres: parseGenres(seriesMeta?.genres),
    imdb_id: seriesMeta?.imdbId ?? undefined,
    videos,
  };
}

export async function getMovieMeta(
  stremioId: string,
  userId?: string,
): Promise<StremioMeta> {
  const user = await requireLibraryUser(userId);

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
    poster: resolvePosterUrl(movie.posterPath),
    background: resolveBackdropUrl(movie.backdropPath),
    description: movie.overview ?? undefined,
    releaseInfo: movie.year ? String(movie.year) : undefined,
    genres: parseGenres(movie.genres),
    imdb_id: movie.imdbId ?? undefined,
  };
}

export async function getRawMediaMeta(
  stremioId: string,
  userId?: string,
): Promise<StremioMeta> {
  const user = await requireLibraryUser(userId);

  const media = await prisma.media.findFirst({
    where: {
      userId: user.id,
      stremioId,
      kind: 'unmatched',
    },
    include: {
      files: {
        take: 1,
        select: { name: true },
      },
    },
  });

  if (!media) {
    throw new NotFoundError('File not found');
  }

  const displayName = media.files[0]?.name ?? media.title;

  return {
    id: media.stremioId,
    type: 'movie',
    name: displayName,
    poster: resolvePosterUrl(media.posterPath),
    background: resolveBackdropUrl(media.backdropPath),
    description: media.overview ?? displayName,
    releaseInfo: media.year ? String(media.year) : undefined,
    genres: parseGenres(media.genres),
    imdb_id: media.imdbId ?? undefined,
  };
}

function parseGenres(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }
  const names = value
    .map((item) =>
      typeof item === 'object' && item && 'name' in item
        ? String((item as { name: string }).name)
        : null,
    )
    .filter((name): name is string => Boolean(name));
  return names.length > 0 ? names : undefined;
}

function pad2(value: number): string {
  return value.toString().padStart(2, '0');
}
