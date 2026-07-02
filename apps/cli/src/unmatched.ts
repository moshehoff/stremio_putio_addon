import { getDefaultUser, prisma } from '@putio-stremio/db';

async function main() {
  const user = await getDefaultUser();
  if (!user) {
    console.error('No user found. Run npm run scan first.');
    process.exit(1);
  }

  const rows = await prisma.media.findMany({
    where: { userId: user.id, kind: 'unmatched' },
    include: {
      files: {
        select: { name: true, putioFileId: true, size: true },
      },
    },
    orderBy: { title: 'asc' },
  });

  console.log(`Unmatched files: ${rows.length}\n`);

  for (const row of rows) {
    const file = row.files[0];
    const sizeGb = file
      ? (Number(file.size) / 1024 ** 3).toFixed(2)
      : '?';
    console.log(`- ${file?.name ?? row.title}`);
    console.log(`  putio file id: ${file?.putioFileId ?? 'n/a'} | ${sizeGb} GB`);
  }
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
