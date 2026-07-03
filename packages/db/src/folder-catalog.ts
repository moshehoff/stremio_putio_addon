import {
  buildFolderCatalogId,
  buildFolderSeriesStremioId,
  parseFolderCatalogId,
  parseFolderSeriesStremioId,
} from '@putio-stremio/media-parser';
import { NotFoundError } from '@putio-stremio/shared';
import { prisma } from './client.js';
import type { CatalogExtra, StremioMetaPreview } from './catalog.js';
import { seriesTitleFromKey } from './catalog.js';
import { getDefaultUser } from './parse.js';
import { requireLibraryUser } from './library-user.js';
import {
  resolveBackdropUrl,
  resolvePosterUrl,
} from './posters.js';
import { getFolderName } from './folders.js';
import type { StremioMeta, StremioVideo } from './meta.js';

const PAGE_SIZE = 100;

export interface FolderCatalogDefinition {
  rootFolderId: number;
  catalogId: string;
  name: string;
}

export async function listFoldersWithMedia(
  userId: string,
): Promise<FolderCatalogDefinition[]> {
  const rows = await prisma.putioFile.findMany({
    where: {
      userId,
      putioFileId: { gt: 0 },
      mediaId: { not: null },
    },
    select: { rootFolderId: true },
    distinct: ['rootFolderId'],
  });

  const folders = await Promise.all(
    rows.map(async (row) => {
      const name = await getFolderName(userId, row.rootFolderId);
      return {
        rootFolderId: row.rootFolderId,
        catalogId: buildFolderCatalogId(row.rootFolderId),
        name,
      };
    }),
  );

  return folders.sort((a, b) => a.name.localeCompare(b.name));
}

export async function getFolderCatalogDefinitions(
  userId?: string,
): Promise<FolderCatalogDefinition[]> {
  const user = userId
    ? await requireLibraryUser(userId)
    : await getDefaultUser();
  if (!user) {
    return [];
  }
  return listFoldersWithMedia(user.id);
}

export function folderCatalogDisplayName(folderName: string): string {
  return `Put.io ${folderName}`;
}

function fileInRootFolder(rootFolderId: number) {
  return {
    rootFolderId,
    putioFileId: { gt: 0 },
  } as const;
}

export async function getFolderMediaCatalog(
  catalogId: string,
  extra: CatalogExtra = {},
  userId?: string,
): Promise<StremioMetaPreview[]> {
  const rootFolderId = parseFolderCatalogId(catalogId);
  if (rootFolderId === null) {
    return [];
  }

  const user = await requireLibraryUser(userId);

  const skip = extra.skip ?? 0;
  const search = extra.search?.trim().toLowerCase();

  const rows = await prisma.media.findMany({
    where: {
      userId: user.id,
      files: {
        some: fileInRootFolder(rootFolderId),
      },
    },
    include: {
      files: {
        where: fileInRootFolder(rootFolderId),
        take: 1,
        select: { name: true },
      },
    },
  });

  const metas: StremioMetaPreview[] = [];
  const seriesMap = new Map<
    string,
    { title: string; count: number; year?: number | null }
  >();

  for (const row of rows) {
    if (row.files.length === 0) {
      continue;
    }

    if (row.kind === 'episode' && row.seriesKey) {
      const existing = seriesMap.get(row.seriesKey);
      if (existing) {
        existing.count += 1;
      } else {
        seriesMap.set(row.seriesKey, {
          title: row.title,
          count: 1,
          year: row.year,
        });
      }
      continue;
    }

    if (row.kind === 'movie') {
      metas.push({
        id: row.stremioId,
        type: 'movie',
        name: row.title,
        poster: resolvePosterUrl(row.posterPath),
        releaseInfo: row.year ? String(row.year) : undefined,
      });
      continue;
    }

    if (row.kind === 'unmatched') {
      metas.push({
        id: row.stremioId,
        type: 'movie',
        name: row.files[0]!.name,
        poster: resolvePosterUrl(row.posterPath),
        releaseInfo: row.year ? String(row.year) : undefined,
      });
    }
  }

  const seriesKeys = [...seriesMap.keys()];
  const seriesMetaRows =
    seriesKeys.length > 0
      ? await prisma.seriesMeta.findMany({
          where: {
            userId: user.id,
            seriesKey: { in: seriesKeys },
          },
        })
      : [];
  const seriesMetaByKey = new Map(
    seriesMetaRows.map((item) => [item.seriesKey, item]),
  );

  for (const [seriesKey, info] of seriesMap) {
    const enriched = seriesMetaByKey.get(seriesKey);
    metas.push({
      id: buildFolderSeriesStremioId(rootFolderId, seriesKey),
      type: 'series',
      name: info.title,
      poster: resolvePosterUrl(enriched?.posterPath),
      releaseInfo: enriched?.year
        ? String(enriched.year)
        : info.year
          ? String(info.year)
          : `${info.count} eps`,
    });
  }

  let sorted = metas.sort((a, b) => a.name.localeCompare(b.name));

  if (search) {
    sorted = sorted.filter((item) => item.name.toLowerCase().includes(search));
  }

  return sorted.slice(skip, skip + PAGE_SIZE);
}

export async function getFolderSeriesMeta(
  stremioId: string,
  userId?: string,
): Promise<StremioMeta> {
  const parsed = parseFolderSeriesStremioId(stremioId);
  if (!parsed) {
    throw new NotFoundError('Invalid folder series id');
  }

  const { parentId: rootFolderId, seriesKey } = parsed;
  const user = await requireLibraryUser(userId);

  const episodes = await prisma.media.findMany({
    where: {
      userId: user.id,
      kind: 'episode',
      seriesKey,
      season: { not: null },
      episode: { not: null },
      files: { some: fileInRootFolder(rootFolderId) },
    },
    include: {
      files: {
        where: fileInRootFolder(rootFolderId),
        take: 1,
        select: { name: true },
        orderBy: { name: 'asc' },
      },
    },
    orderBy: [{ season: 'asc' }, { episode: 'asc' }],
  });

  if (episodes.length === 0) {
    throw new NotFoundError('Series not found in folder');
  }

  const title = episodes[0]?.title ?? seriesTitleFromKey(seriesKey);
  const folderName = await getFolderName(user.id, rootFolderId);

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
    title:
      item.files[0]?.name ??
      `S${pad2(item.season!)}E${pad2(item.episode!)}`,
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
      `${videos.length} episode(s) in ${folderName}`,
    releaseInfo: seriesMeta?.year ? String(seriesMeta.year) : undefined,
    genres: parseGenres(seriesMeta?.genres),
    imdb_id: seriesMeta?.imdbId ?? undefined,
    videos,
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
