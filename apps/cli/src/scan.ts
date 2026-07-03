import {
  formatLibrarySummary,
  getPutioAccessToken,
  scanPutioLibrary,
} from '@putio-stremio/db';
import { getEnv } from '@putio-stremio/shared';

function parseArgs(argv: string[]) {
  return {
    dryRun: argv.includes('--dry-run'),
  };
}

async function main() {
  const { dryRun } = parseArgs(process.argv.slice(2));
  const env = getEnv();

  if (!env.DATABASE_URL) {
    console.error('DATABASE_URL is missing. Run docker compose up -d first.');
    process.exit(1);
  }

  const putioToken = await getPutioAccessToken();
  if (!putioToken) {
    console.error(
      'No Put.io token found. Set PUTIO_TOKEN in .env or save one at /configure.',
    );
    process.exit(1);
  }

  console.log(dryRun ? 'Dry run — listing files only...' : 'Scanning Put.io library...');

  const result = await scanPutioLibrary({
    putioToken,
    dryRun,
  });

  console.log('');
  console.log(`Account:  ${result.username}`);
  console.log(`Found:    ${result.filesFound} video files`);
  if (!dryRun) {
    console.log(`Saved:    ${result.filesUpserted} files to database`);
    console.log(`Scan run: ${result.scanRunId}`);

    if (result.parse) {
      console.log('');
      console.log(
        `Parse:    ${result.parse.episodes} episodes, ${result.parse.movies} movies, ${result.parse.unmatched} unmatched`,
      );
    }

    if (result.library) {
      console.log(formatLibrarySummary(result.library));
    }

    if (result.enrich) {
      console.log('');
      console.log(
        `Enrich:   ${result.enrich.moviesMatched} movies, ${result.enrich.unmatchedMatched} unmatched posters (${result.enrich.moviesSkipped + result.enrich.unmatchedSkipped} cached)`,
      );
    }
  }
}

main().catch((error) => {
  console.error('Scan failed:', error instanceof Error ? error.message : error);
  process.exit(1);
});
