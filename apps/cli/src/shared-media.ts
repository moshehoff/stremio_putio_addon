import { getDefaultUser, prisma } from '@putio-stremio/db';

async function main() {
  const user = await getDefaultUser();
  if (!user) {
    console.log('No user');
    return;
  }

  const media = await prisma.media.findMany({
    where: { userId: user.id },
    include: {
      _count: { select: { files: true } },
      files: { select: { name: true } },
    },
  });

  const multi = media.filter((m) => m._count.files > 1);
  console.log('Media linked to multiple files:', multi.length);

  for (const m of multi.slice(0, 20)) {
    console.log(
      m.kind,
      m.stremioId,
      '->',
      m.files.map((f) => f.name).join(' | '),
    );
  }

  if (multi.length > 20) {
    console.log('... and', multi.length - 20, 'more');
  }
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
