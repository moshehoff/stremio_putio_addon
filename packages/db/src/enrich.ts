import { createTmdbProvider, withTmdbThrottle } from '@putio-stremio/tmdb-client';
import { createLogger, requireTmdbApiKey } from '@putio-stremio/shared';
import { prisma } from './client.js';
import { getDefaultUser } from './parse.js';
import { yearFromDate } from './posters.js';

const log = createLogger('enrich');

export interface EnrichResult {
  seriesMatched: number;
  seriesFailed: number;
  moviesMatched: number;
  moviesFailed: number;
}

export async function enrichLibraryMetadata(): Promise<EnrichResult> {
  const user = await getDefaultUser();
  if (!user) {
    throw new Error('No default user in database — run scan first');
  }

  const tmdb = createTmdbProvider(requireTmdbApiKey());
  let seriesMatched = 0;
  let seriesFailed = 0;
  let moviesMatched = 0;
  let moviesFailed = 0;

  const episodes = await prisma.media.findMany({
    where: {
      userId: user.id,
      kind: 'episode',
      seriesKey: { not: null },
    },
    select: {
      title: true,
      seriesKey: true,
      year: true,
    },
  });

  const seriesMap = new Map<string, { title: string; year?: number | null }>();
  for (const episode of episodes) {
    if (!episode.seriesKey) {
      continue;
    }
    if (!seriesMap.has(episode.seriesKey)) {
      seriesMap.set(episode.seriesKey, {
        title: episode.title,
        year: episode.year,
      });
    }
  }

  for (const [seriesKey, info] of seriesMap) {
    const existing = await prisma.seriesMeta.findUnique({
      where: {
        userId_seriesKey: {
          userId: user.id,
          seriesKey,
        },
      },
    });

    if (existing?.metadataStatus === 'matched' && existing.imdbId) {
      seriesMatched += 1;
      continue;
    }

    try {
      const search = await withTmdbThrottle(() =>
        tmdb.searchTv(info.title, info.year ?? undefined),
      );

      if (!search) {
        await prisma.seriesMeta.upsert({
          where: {
            userId_seriesKey: { userId: user.id, seriesKey },
          },
          create: {
            userId: user.id,
            seriesKey,
            title: info.title,
            year: info.year ?? null,
            metadataStatus: 'failed',
          },
          update: { metadataStatus: 'failed' },
        });
        seriesFailed += 1;
        continue;
      }

      const details = await withTmdbThrottle(() => tmdb.getTvDetails(search.id));

      await prisma.seriesMeta.upsert({
        where: {
          userId_seriesKey: { userId: user.id, seriesKey },
        },
        create: {
          userId: user.id,
          seriesKey,
          title: info.title,
          tmdbId: details.id,
          imdbId: details.imdbId ?? null,
          posterPath: details.posterPath ?? null,
          backdropPath: details.backdropPath ?? null,
          overview: details.overview ?? null,
          genres: details.genres ?? undefined,
          year: yearFromDate(details.firstAirDate) ?? info.year ?? null,
          metadataStatus: 'matched',
        },
        update: {
          tmdbId: details.id,
          imdbId: details.imdbId ?? null,
          posterPath: details.posterPath ?? null,
          backdropPath: details.backdropPath ?? null,
          overview: details.overview ?? null,
          genres: details.genres ?? undefined,
          year: yearFromDate(details.firstAirDate) ?? info.year ?? null,
          metadataStatus: 'matched',
        },
      });
      seriesMatched += 1;
    } catch (error) {
      log.warn({ err: error, seriesKey }, 'Series TMDb enrich failed');
      seriesFailed += 1;
    }
  }

  const movies = await prisma.media.findMany({
    where: {
      userId: user.id,
      kind: 'movie',
    },
  });

  for (const movie of movies) {
    if (movie.metadataStatus === 'matched' && movie.posterPath && movie.imdbId) {
      moviesMatched += 1;
      continue;
    }

    try {
      const search = await withTmdbThrottle(() =>
        tmdb.searchMovie(movie.title, movie.year ?? undefined),
      );

      if (!search) {
        await prisma.media.update({
          where: { id: movie.id },
          data: { metadataStatus: 'failed' },
        });
        moviesFailed += 1;
        continue;
      }

      const details = await withTmdbThrottle(() =>
        tmdb.getMovieDetails(search.id),
      );

      await prisma.media.update({
        where: { id: movie.id },
        data: {
          tmdbId: details.id,
          imdbId: details.imdbId ?? null,
          posterPath: details.posterPath ?? null,
          backdropPath: details.backdropPath ?? null,
          overview: details.overview ?? null,
          genres: details.genres ?? undefined,
          year: yearFromDate(details.releaseDate) ?? movie.year,
          metadataStatus: 'matched',
        },
      });
      moviesMatched += 1;
    } catch (error) {
      log.warn({ err: error, movieId: movie.id }, 'Movie TMDb enrich failed');
      moviesFailed += 1;
    }
  }

  log.info(
    { seriesMatched, seriesFailed, moviesMatched, moviesFailed },
    'Metadata enrichment completed',
  );

  return { seriesMatched, seriesFailed, moviesMatched, moviesFailed };
}
