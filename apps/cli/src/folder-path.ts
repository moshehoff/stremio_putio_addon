import { prisma, getDefaultUser } from '@putio-stremio/db';
import { getEnv } from '@putio-stremio/shared';
import { createPutioProvider } from '@putio-stremio/putio-client';

async function folderPath(
  putio: ReturnType<typeof createPutioProvider>,
  folderId: number,
): Promise<string> {
  const parts: string[] = [];
  let id = folderId;

  for (let depth = 0; depth < 12 && id > 0; depth += 1) {
    const folder = await putio.getFile(id);
    parts.unshift(`${folder.name} [${id}]`);
    id = folder.parentId;
  }

  return parts.join(' → ');
}

async function main() {
  const env = getEnv();
  const putio = createPutioProvider(env.PUTIO_TOKEN!);
  const user = await getDefaultUser();
  if (!user) {
    console.error('No user');
    process.exit(1);
  }

  const sample = await prisma.putioFile.findFirst({
    where: {
      userId: user.id,
      parentId: 1568711549,
    },
    select: { name: true, parentId: true },
  });

  console.log('HIMYM folder path:');
  console.log(await folderPath(putio, 1568711549));
  if (sample) {
    console.log('Sample file:', sample.name);
  }

  const etFolders = await prisma.putioFolder.findMany({
    where: {
      userId: user.id,
      OR: [
        { name: { equals: 'ET', mode: 'insensitive' } },
        { name: { contains: 'ET', mode: 'insensitive' } },
      ],
    },
  });

  console.log('\nFolders matching ET in DB:');
  for (const f of etFolders) {
    console.log(`  ${f.name} [${f.putioFolderId}]`);
    try {
      console.log(`    path: ${await folderPath(putio, f.putioFolderId)}`);
    } catch {
      console.log('    (could not resolve path)');
    }
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
