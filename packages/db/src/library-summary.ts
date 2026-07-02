import { buildFolderCatalogId, buildFolderSeriesStremioId } from '@putio-stremio/media-parser';
import { prisma } from './client.js';
import { listFoldersWithMedia } from './folder-catalog.js';
import { getDefaultUser } from './parse.js';
import type { ParseResult } from './parse.js';

export interface LibrarySummarySeriesItem {
  stremioId: string;
  name: string;
  episodeCount: number;
}

export interface LibrarySummaryFolderItem {
  catalogId: string;
  rootFolderId: number;
  name: string;
  catalogName: string;
  series: LibrarySummarySeriesItem[];
  movies: string[];
  unmatched: string[];
}

export interface LibrarySummary {
  parse: ParseResult & { totalFiles: number };
  folders: LibrarySummaryFolderItem[];
  stremio: {
    catalogCount: number;
    totalCatalogEntries: number;
  };
  warnings: string[];
}

const MAX_ITEMS_SHOWN = 5;

function fileInRootFolder(rootFolderId: number) {
  return {
    rootFolderId,
    putioFileId: { gt: 0 },
  } as const;
}

export async function getLibrarySummary(userId: string): Promise<LibrarySummary> {
  const warnings: string[] = [];

  const [folderDefs, invalidFiles] = await Promise.all([
    listFoldersWithMedia(userId),
    prisma.putioFile.count({ where: { userId, putioFileId: { lte: 0 } } }),
  ]);

  if (invalidFiles > 0) {
    warnings.push(
      `${invalidFiles} invalid Put.io file record(s) with id <= 0 — skipped`,
    );
  }

  const folders: LibrarySummaryFolderItem[] = [];
  let totalCatalogEntries = 0;
  let episodeCount = 0;
  let movieCount = 0;
  let unmatchedCount = 0;

  for (const folder of folderDefs) {
    const rows = await prisma.media.findMany({
      where: {
        userId,
        files: {
          some: fileInRootFolder(folder.rootFolderId),
        },
      },
      include: {
        files: {
          where: fileInRootFolder(folder.rootFolderId),
          take: 1,
          select: { name: true },
        },
      },
    });

    const seriesMap = new Map<string, { name: string; episodeCount: number }>();
    const movies: string[] = [];
    const unmatched: string[] = [];

    for (const row of rows) {
      if (row.files.length === 0) {
        continue;
      }

      if (row.kind === 'episode' && row.seriesKey) {
        episodeCount += 1;
        const existing = seriesMap.get(row.seriesKey);
        if (existing) {
          existing.episodeCount += 1;
        } else {
          seriesMap.set(row.seriesKey, {
            name: row.title,
            episodeCount: 1,
          });
        }
        continue;
      }

      if (row.kind === 'movie') {
        movieCount += 1;
        movies.push(row.title);
        continue;
      }

      if (row.kind === 'unmatched') {
        unmatchedCount += 1;
        unmatched.push(row.files[0]!.name);
      }
    }

    const series = [...seriesMap.entries()]
      .map(([seriesKey, info]) => ({
        stremioId: buildFolderSeriesStremioId(folder.rootFolderId, seriesKey),
        name: info.name,
        episodeCount: info.episodeCount,
      }))
      .sort((a, b) => a.name.localeCompare(b.name));

    movies.sort((a, b) => a.localeCompare(b));
    unmatched.sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

    const entryCount = series.length + movies.length + unmatched.length;
    totalCatalogEntries += entryCount;

    folders.push({
      catalogId: buildFolderCatalogId(folder.rootFolderId),
      rootFolderId: folder.rootFolderId,
      name: folder.name,
      catalogName: `Put.io ${folder.name}`,
      series,
      movies,
      unmatched,
    });
  }

  const parse: LibrarySummary['parse'] = {
    filesProcessed: episodeCount + movieCount + unmatchedCount,
    mediaUpserted: episodeCount + movieCount + unmatchedCount,
    episodes: episodeCount,
    movies: movieCount,
    unmatched: unmatchedCount,
    totalFiles: episodeCount + movieCount + unmatchedCount,
  };

  return {
    parse,
    folders,
    stremio: {
      catalogCount: folders.length,
      totalCatalogEntries,
    },
    warnings,
  };
}

export async function getLibrarySummaryForDefaultUser(): Promise<LibrarySummary | null> {
  const user = await getDefaultUser();
  if (!user) {
    return null;
  }
  return getLibrarySummary(user.id);
}

export function formatLibrarySummary(summary: LibrarySummary): string {
  const lines: string[] = [];

  lines.push('');
  lines.push('=== Library structure (what Stremio will show) ===');
  lines.push('');
  lines.push(
    `Parsed: ${summary.parse.totalFiles} files → ${summary.parse.episodes} episodes, ${summary.parse.movies} movies, ${summary.parse.unmatched} unmatched`,
  );
  lines.push(
    `Stremio catalogs: ${summary.stremio.catalogCount} top-level folders, ${summary.stremio.totalCatalogEntries} total entries`,
  );
  lines.push('');

  if (summary.folders.length === 0) {
    lines.push('(no folders with media — run scan first)');
  }

  for (const folder of summary.folders) {
    const total =
      folder.series.length + folder.movies.length + folder.unmatched.length;
    lines.push(`${folder.catalogName} [${folder.catalogId}] — ${total} items`);

    for (const series of folder.series) {
      lines.push(
        `  📺 ${series.name} — ${series.episodeCount} episode(s)`,
      );
    }

    for (const movie of folder.movies.slice(0, MAX_ITEMS_SHOWN)) {
      lines.push(`  🎬 ${movie}`);
    }
    if (folder.movies.length > MAX_ITEMS_SHOWN) {
      lines.push(
        `  … and ${folder.movies.length - MAX_ITEMS_SHOWN} more movies`,
      );
    }

    for (const file of folder.unmatched.slice(0, MAX_ITEMS_SHOWN)) {
      lines.push(`  📄 ${file}`);
    }
    if (folder.unmatched.length > MAX_ITEMS_SHOWN) {
      lines.push(
        `  … and ${folder.unmatched.length - MAX_ITEMS_SHOWN} more unsorted files`,
      );
    }

    lines.push('');
  }

  if (summary.warnings.length > 0) {
    lines.push('Warnings:');
    for (const warning of summary.warnings) {
      lines.push(`  ⚠ ${warning}`);
    }
    lines.push('');
  }

  lines.push(
    'Each top-level Put.io folder is a Stremio catalog. All nested series, movies, and unsorted files roll up into it.',
  );

  return lines.join('\n');
}
