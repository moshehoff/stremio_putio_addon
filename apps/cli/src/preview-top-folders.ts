import { prisma, getDefaultUser } from '@putio-stremio/db';
import { getEnv } from '@putio-stremio/shared';
import { createPutioProvider, PutioFileNotFoundError } from '@putio-stremio/putio-client';

type FolderInfo = { id: number; name: string; parentId: number };

async function main() {
  const env = getEnv();
  const putio = createPutioProvider(env.PUTIO_TOKEN!);
  const user = await getDefaultUser();
  if (!user) {
    console.error('No user');
    process.exit(1);
  }

  const folderCache = new Map<number, FolderInfo>();

  async function getFolder(id: number): Promise<FolderInfo> {
    if (id == null || Number.isNaN(id) || id <= 0) {
      return { id: 0, name: 'Your Files', parentId: -1 };
    }
    const cached = folderCache.get(id);
    if (cached) {
      return cached;
    }
    try {
      const file = await putio.getFile(id);
      const info = { id, name: file.name, parentId: file.parentId };
      folderCache.set(id, info);
      return info;
    } catch (error) {
      if (error instanceof PutioFileNotFoundError) {
        const fallback = { id, name: `Folder ${id}`, parentId: 0 };
        folderCache.set(id, fallback);
        return fallback;
      }
      throw error;
    }
  }

  /** Top-level = direct child of Put.io root (parentId <= 0). */
  async function topLevelFolderId(startFolderId: number): Promise<number> {
    if (startFolderId <= 0) {
      return 0;
    }

    let currentId = startFolderId;
    for (let depth = 0; depth < 20; depth += 1) {
      const folder = await getFolder(currentId);
      if (folder.parentId == null || folder.parentId <= 0) {
        return folder.id;
      }
      currentId = folder.parentId;
    }

    return currentId;
  }

  const files = await prisma.putioFile.findMany({
    where: {
      userId: user.id,
      putioFileId: { gt: 0 },
      mediaId: { not: null },
    },
    include: {
      media: {
        select: {
          kind: true,
          title: true,
          seriesKey: true,
          year: true,
        },
      },
    },
  });

  type SeriesGroup = { name: string; episodes: number };
  type TopFolder = {
    name: string;
    id: number;
    series: Map<string, SeriesGroup>;
    movies: string[];
    unsorted: string[];
  };

  const topFolders = new Map<number, TopFolder>();

  for (const file of files) {
    if (!file.media) {
      continue;
    }

    const parentId = file.parentId <= 0 ? 0 : file.parentId;
    const topId = await topLevelFolderId(parentId);
    let bucket = topFolders.get(topId);
    if (!bucket) {
      const top = await getFolder(topId);
      bucket = {
        name: top.name,
        id: topId,
        series: new Map(),
        movies: [],
        unsorted: [],
      };
      topFolders.set(topId, bucket);
    }

    const media = file.media;

    if (media.kind === 'episode' && media.seriesKey) {
      const existing = bucket.series.get(media.seriesKey);
      if (existing) {
        existing.episodes += 1;
      } else {
        bucket.series.set(media.seriesKey, {
          name: media.title,
          episodes: 1,
        });
      }
    } else if (media.kind === 'movie') {
      bucket.movies.push(media.title);
    } else if (media.kind === 'unmatched') {
      bucket.unsorted.push(file.name);
    }
  }

  const sorted = [...topFolders.values()].sort((a, b) =>
    a.name.localeCompare(b.name),
  );

  console.log('');
  console.log('=== PREVIEW: Stremio with top-level folder catalogs ===');
  console.log('(Each folder directly under Put.io root → one catalog)');
  console.log('');

  let totalCatalogs = 0;
  let totalEntries = 0;

  for (const folder of sorted) {
    const seriesList = [...folder.series.values()].sort((a, b) =>
      a.name.localeCompare(b.name),
    );
    const entryCount =
      seriesList.length + folder.movies.length + folder.unsorted.length;

    if (entryCount === 0) {
      continue;
    }

    totalCatalogs += 1;
    totalEntries += entryCount;

    console.log(`📂 Put.io ${folder.name}`);
    console.log(`   (${entryCount} items — series + movies + unsorted from all subfolders)`);
    console.log('');

    for (const series of seriesList) {
      console.log(`   📺 ${series.name}  (${series.episodes} episodes, poster)`);
    }

    const moviesShown = folder.movies.slice(0, 5);
    for (const movie of moviesShown) {
      console.log(`   🎬 ${movie}`);
    }
    if (folder.movies.length > 5) {
      console.log(`   … and ${folder.movies.length - 5} more movies`);
    }

    const unsortedShown = folder.unsorted.slice(0, 5);
    for (const raw of unsortedShown) {
      console.log(`   📄 ${raw}`);
    }
    if (folder.unsorted.length > 5) {
      console.log(`   … and ${folder.unsorted.length - 5} more unsorted files`);
    }

    console.log('');
  }

  console.log('---');
  console.log(`Total: ${totalCatalogs} catalogs, ${totalEntries} entries`);
  console.log('');
  console.log('Example drill-down:');
  console.log('  Put.io ET → tap "How I Met Your Mother" → 22 episodes under one poster');
  console.log('  Put.io Idan → tap "Breaking Bad" → all seasons/episodes in Idan tree combined');
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
