import { scanPutioLibrary } from '@putio-stremio/db';
import { getEnv } from '@putio-stremio/shared';

function parseArgs(argv: string[]) {
  return {
    dryRun: argv.includes('--dry-run'),
  };
}

async function main() {
  const { dryRun } = parseArgs(process.argv.slice(2));
  const env = getEnv();

  if (!env.PUTIO_TOKEN) {
    console.error('PUTIO_TOKEN is missing. Add it to your .env file.');
    process.exit(1);
  }

  if (!env.DATABASE_URL) {
    console.error('DATABASE_URL is missing. Run docker compose up -d first.');
    process.exit(1);
  }

  console.log(dryRun ? 'Dry run — listing files only...' : 'Scanning Put.io library...');

  const result = await scanPutioLibrary({
    putioToken: env.PUTIO_TOKEN,
    dryRun,
  });

  console.log('');
  console.log(`Account:  ${result.username}`);
  console.log(`Found:    ${result.filesFound} video files`);
  if (!dryRun) {
    console.log(`Saved:    ${result.filesUpserted} files to database`);
    console.log(`Scan run: ${result.scanRunId}`);
  }
}

main().catch((error) => {
  console.error('Scan failed:', error instanceof Error ? error.message : error);
  process.exit(1);
});
