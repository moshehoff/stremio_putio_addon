import {
  enrichLibraryMetadata,
  type EnrichProgress,
} from '@putio-stremio/db';

function formatProgress(progress: EnrichProgress): string {
  const prefix = `[${progress.phase} ${progress.current}/${progress.total}]`;
  switch (progress.status) {
    case 'skip':
      return `${prefix} skip ${progress.label}`;
    case 'ok':
      return `${prefix} ok   ${progress.label}`;
    case 'fail':
      return `${prefix} FAIL ${progress.label}`;
    default:
      return `${prefix} ...  ${progress.label}`;
  }
}

async function main() {
  console.log('Enriching library metadata from TMDb...');
  console.log('(Movies take a while — ~2 API calls each with throttle)\n');

  const result = await enrichLibraryMetadata({
    onProgress: (progress) => {
      console.log(formatProgress(progress));
    },
  });

  console.log('');
  console.log(
    `Series: ${result.seriesMatched} matched, ${result.seriesFailed} failed (${result.seriesSkipped} cached)`,
  );
  console.log(
    `Movies: ${result.moviesMatched} matched, ${result.moviesFailed} failed (${result.moviesSkipped} cached)`,
  );
  console.log(
    `Unmatched: ${result.unmatchedMatched} posters, ${result.unmatchedFailed} failed (${result.unmatchedSkipped} cached)`,
  );
  console.log('Done.');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
