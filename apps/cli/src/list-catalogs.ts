import {
  getFolderCatalogDefinitions,
  getDefaultUser,
  prisma,
} from '@putio-stremio/db';

async function main() {
  const user = await getDefaultUser();
  if (!user) {
    process.exit(1);
  }

  const catalogs = await getFolderCatalogDefinitions();
  console.log(`Current API catalogs (${catalogs.length}):`);
  for (const c of catalogs.sort((a, b) => a.name.localeCompare(b.name))) {
    console.log(`  Put.io ${c.name} [${c.catalogId}]`);
  }

  const folders = await prisma.putioFolder.findMany({ where: { userId: user.id } });
  const byId = new Map(folders.map((f) => [f.putioFolderId, f]));

  function path(id: number): string {
    const parts: string[] = [];
    let cur = id;
    for (let i = 0; i < 12 && cur > 0; i += 1) {
      const folder = byId.get(cur);
      if (!folder) {
        break;
      }
      parts.unshift(folder.name);
      cur = folder.parentFolderId;
    }
    return parts.join(' → ');
  }

  const needles = ['One Punch', 'Pride', 'Season 3', 'Season 4', 'Season 5'];
  console.log('\nWhere those folders live in Put.io:');
  for (const folder of folders) {
    if (!needles.some((n) => folder.name.includes(n))) {
      continue;
    }
    const top = path(folder.putioFolderId).split(' → ')[0];
    console.log(`  ${folder.name}`);
    console.log(`    full path: ${path(folder.putioFolderId)}`);
    console.log(`    rolls up to catalog: Put.io ${top}`);
  }
}

main()
  .finally(() => prisma.$disconnect());
