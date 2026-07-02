import { savePutioAccessToken } from '@putio-stremio/db';
import { getEnv } from '@putio-stremio/shared';

async function main() {
  const token = getEnv().PUTIO_TOKEN;
  if (!token) {
    console.error('PUTIO_TOKEN is not set in .env');
    process.exit(1);
  }

  await savePutioAccessToken(token);
  console.log('Put.io token saved to database (encrypted).');
}

main().catch((error) => {
  console.error(
    'Failed to save token:',
    error instanceof Error ? error.message : error,
  );
  process.exit(1);
});
