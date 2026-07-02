import { prisma, getDefaultUser } from '@putio-stremio/db';

async function main() {
  const user = await getDefaultUser();
  if (!user) {
    console.error('No user');
    process.exit(1);
  }

  const [
    fileCount,
    mediaCount,
    filesWithMedia,
    filesNoMedia,
    orphanMedia,
    invalidFiles,
    rootFolderGroups,
    episodeMedia,
    movieMedia,
    unmatchedMedia,
  ] = await Promise.all([
    prisma.putioFile.count({ where: { userId: user.id, putioFileId: { gt: 0 } } }),
    prisma.media.count({ where: { userId: user.id } }),
    prisma.putioFile.count({ where: { userId: user.id, putioFileId: { gt: 0 }, mediaId: { not: null } } }),
    prisma.putioFile.count({ where: { userId: user.id, putioFileId: { gt: 0 }, mediaId: null } }),
    prisma.media.count({ where: { userId: user.id, files: { none: {} } } }),
    prisma.putioFile.count({ where: { userId: user.id, putioFileId: { lte: 0 } } }),
    prisma.putioFile.groupBy({
      by: ['rootFolderId'],
      where: { userId: user.id, putioFileId: { gt: 0 }, mediaId: { not: null } },
      _count: true,
    }),
    prisma.media.count({ where: { userId: user.id, kind: 'episode' } }),
    prisma.media.count({ where: { userId: user.id, kind: 'movie' } }),
    prisma.media.count({ where: { userId: user.id, kind: 'unmatched' } }),
  ]);

  console.log('=== Scan validation ===\n');
  console.log('Files (valid):     ', fileCount);
  console.log('Files with media:  ', filesWithMedia);
  console.log('Files without media:', filesNoMedia);
  console.log('Media rows:        ', mediaCount);
  console.log('Orphan media:      ', orphanMedia);
  console.log('Invalid file ids:  ', invalidFiles);
  console.log('');
  console.log('Media by kind:');
  console.log('  episodes:', episodeMedia);
  console.log('  movies:  ', movieMedia);
  console.log('  unmatched:', unmatchedMedia);
  console.log('  sum:     ', episodeMedia + movieMedia + unmatchedMedia);
  console.log('');
  console.log('Root folders with media:', rootFolderGroups.length);

  const folders = await prisma.putioFolder.findMany({
    where: { userId: user.id },
    select: { putioFolderId: true, name: true, parentFolderId: true },
  });
  const nameById = new Map(folders.map((f) => [f.putioFolderId, f.name]));

  for (const g of rootFolderGroups.sort((a, b) => a.rootFolderId - b.rootFolderId)) {
    console.log(`  ${nameById.get(g.rootFolderId) ?? 'Folder ' + g.rootFolderId}: ${g._count} files`);
  }

  // Duplicate movies (same title)
  const movies = await prisma.media.findMany({
    where: { userId: user.id, kind: 'movie' },
    select: { title: true },
  });
  const titleCounts = new Map<string, number>();
  for (const m of movies) {
    titleCounts.set(m.title, (titleCounts.get(m.title) ?? 0) + 1);
  }
  const dupes = [...titleCounts.entries()].filter(([, c]) => c > 1).sort((a, b) => b[1] - a[1]);
  console.log('\nDuplicate movie titles:', dupes.length);
  for (const [title, count] of dupes.slice(0, 8)) {
    console.log(`  ${count}x ${title}`);
  }

  // OPM in ET - both episode and unmatched
  const opmUnmatched = await prisma.putioFile.count({
    where: {
      userId: user.id,
      rootFolderId: 1165897681,
      media: { kind: 'unmatched' },
      name: { contains: 'One Punch Man', mode: 'insensitive' },
    },
  });
  const opmEpisodes = await prisma.media.count({
    where: {
      userId: user.id,
      kind: 'episode',
      seriesKey: { contains: 'one-punch' },
      files: { some: { rootFolderId: 1165897681 } },
    },
  });
  console.log('\nOne Punch Man in ET:');
  console.log('  parsed episodes:', opmEpisodes);
  console.log('  unmatched BlazeAnime files:', opmUnmatched);

  // dynamite clips location
  const dynamite = await prisma.putioFile.count({
    where: {
      userId: user.id,
      name: { contains: 'Ukraine', mode: 'insensitive' },
    },
  });
  const dynamiteRoots = await prisma.putioFile.groupBy({
    by: ['rootFolderId'],
    where: {
      userId: user.id,
      name: { contains: 'Mercouris', mode: 'insensitive' },
    },
    _count: true,
  });
  console.log('\nUkraine-related files:', dynamite);
  for (const r of dynamiteRoots) {
    console.log(`  clip root: ${nameById.get(r.rootFolderId) ?? r.rootFolderId} (${r._count})`);
  }

  const multiFileMedia = await prisma.media.findMany({
    where: { userId: user.id },
    include: { files: { select: { name: true } }, _count: { select: { files: true } } },
  });
  const shared = multiFileMedia.filter((m) => m._count.files > 1);
  console.log('\nMedia shared by 2+ files:', shared.length);
  for (const m of shared) {
    console.log(`  ${m.kind} ${m.stremioId}`);
    for (const f of m.files) console.log(`    - ${f.name}`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
