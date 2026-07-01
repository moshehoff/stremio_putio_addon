import { getDefaultUser, parseMediaForUser } from '@putio-stremio/db';

async function main() {
  const user = await getDefaultUser();
  if (!user) {
    console.error('No user found. Run npm run scan first.');
    process.exit(1);
  }

  console.log(`Parsing media for user ${user.putioUsername ?? user.id}...`);
  const result = await parseMediaForUser(user.id);

  console.log('');
  console.log(`Files processed: ${result.filesProcessed}`);
  console.log(`Media upserted:  ${result.mediaUpserted}`);
  console.log(`Episodes:        ${result.episodes}`);
  console.log(`Movies:          ${result.movies}`);
  console.log(`Unmatched:       ${result.unmatched}`);
}

main().catch((error) => {
  console.error('Parse failed:', error instanceof Error ? error.message : error);
  process.exit(1);
});
