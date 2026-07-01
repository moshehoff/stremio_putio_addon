import {
  buildSeriesStremioId,
  slugify,
} from '@putio-stremio/media-parser';
import { prisma } from './client.js';
import { getDefaultUser } from './parse.js';

const PAGE_SIZE = 100;
const PLACEHOLDER_POSTER =
  'https://www.strem.io/images/addon_default.png';

export interface CatalogExtra {
  search?: string;
  skip?: number;
}

export interface StremioMetaPreview {
  id: string;
  type: 'series' | 'movie';
  name: string;
  poster: string;
  releaseInfo?: string;
}

export async function getSeriesCatalog(
  extra: CatalogExtra = {},
): Promise<StremioMetaPreview[]> {
  const user = await getDefaultUser();
  if (!user) {
    return [];
  }

  const skip = extra.skip ?? 0;
  const search = extra.search?.trim().toLowerCase();

  const episodes = await prisma.media.findMany({
    where: {
      userId: user.id,
      kind: 'episode',
      seriesKey: { not: null },
    },
    select: {
      title: true,
      seriesKey: true,
      year: true,
    },
  });

  const seriesMap = new Map<
    string,
    { title: string; seriesKey: string; year?: number | null }
  >();

  for (const item of episodes) {
    if (!item.seriesKey) {
      continue;
    }
    const existing = seriesMap.get(item.seriesKey);
    if (!existing) {
      seriesMap.set(item.seriesKey, {
        title: item.title,
        seriesKey: item.seriesKey,
        year: item.year,
      });
    }
  }

  let seriesList = [...seriesMap.values()].sort((a, b) =>
    a.title.localeCompare(b.title),
  );

  if (search) {
    seriesList = seriesList.filter((series) =>
      series.title.toLowerCase().includes(search),
    );
  }

  const page = seriesList.slice(skip, skip + PAGE_SIZE);

  return page.map((series) => ({
    id: buildSeriesStremioId(series.seriesKey),
    type: 'series' as const,
    name: series.title,
    poster: PLACEHOLDER_POSTER,
    releaseInfo: series.year ? String(series.year) : undefined,
  }));
}

export async function getMoviesCatalog(
  extra: CatalogExtra = {},
): Promise<StremioMetaPreview[]> {
  const user = await getDefaultUser();
  if (!user) {
    return [];
  }

  const skip = extra.skip ?? 0;
  const search = extra.search?.trim().toLowerCase();

  const movies = await prisma.media.findMany({
    where: {
      userId: user.id,
      kind: 'movie',
      ...(search
        ? {
            title: {
              contains: search,
              mode: 'insensitive' as const,
            },
          }
        : {}),
    },
    orderBy: { title: 'asc' },
    skip,
    take: PAGE_SIZE,
  });

  return movies.map((movie) => ({
    id: movie.stremioId,
    type: 'movie' as const,
    name: movie.title,
    poster: PLACEHOLDER_POSTER,
    releaseInfo: movie.year ? String(movie.year) : undefined,
  }));
}

export function parseCatalogExtra(extraPath?: string): CatalogExtra {
  if (!extraPath) {
    return {};
  }

  const params = new URLSearchParams(extraPath);
  const skipRaw = params.get('skip');
  const search = params.get('search') ?? undefined;

  return {
    search,
    skip: skipRaw ? Number.parseInt(skipRaw, 10) : undefined,
  };
}

export function seriesTitleFromKey(seriesKey: string): string {
  return seriesKey
    .split('-')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

export function parseSeriesStremioId(id: string): string | null {
  if (!id.startsWith('putio:series:')) {
    return null;
  }
  const parts = id.split(':');
  if (parts.length !== 3) {
    return null;
  }
  return parts[2] ?? null;
}

export function normalizeSeriesSearch(value: string): string {
  return slugify(value);
}
