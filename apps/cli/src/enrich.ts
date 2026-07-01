import { enrichLibraryMetadata } from '@putio-stremio/db';

async function main() {
  console.log('Enriching library metadata from TMDb...');
  const result = await enrichLibraryMetadata();
  console.log(
    `Series: ${result.seriesMatched} matched, ${result.seriesFailed} failed`,
  );
  console.log(
    `Movies: ${result.moviesMatched} matched, ${result.moviesFailed} failed`,
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
