import type { TmdbSearchResult } from '@putio-stremio/tmdb-client';
import { createTmdbProvider, withTmdbThrottle } from '@putio-stremio/tmdb-client';
import { guessTitleYearForPosterLookup } from '@putio-stremio/media-parser';
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
  unmatchedMatched: number;
  unmatchedFailed: number;
}

export interface EnrichProgress {
  phase: 'series' | 'movies' | 'unmatched';
  current: number;
  total: number;
  label: string;
  status: 'pending' | 'skip' | 'ok' | 'fail';
}

export interface EnrichOptions {
  onProgress?: (progress: EnrichProgress) => void;
}

function report(
  options: EnrichOptions | undefined,
  progress: EnrichProgress,
): void {
  options?.onProgress?.(progress);
}

export async function enrichLibraryMetadata(
  options?: EnrichOptions,
): Promise<EnrichResult> {
  const user = await getDefaultUser();
  if (!user) {
    throw new Error('No default user in database — run scan first');
  }

  const tmdb = createTmdbProvider(requireTmdbApiKey());
  let seriesMatched = 0;
  let seriesFailed = 0;
  let moviesMatched = 0;
  let moviesFailed = 0;
  let unmatchedMatched = 0;
  let unmatchedFailed = 0;

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

  const seriesList = [...seriesMap.entries()];

  report(options, {
    phase: 'series',
    current: 0,
    total: seriesList.length,
    label: `starting (${seriesList.length} series)`,
    status: 'pending',
  });

  for (let i = 0; i < seriesList.length; i += 1) {
    const [seriesKey, info] = seriesList[i]!;
    report(options, {
      phase: 'series',
      current: i + 1,
      total: seriesList.length,
      label: info.title,
      status: 'pending',
    });

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
      report(options, {
        phase: 'series',
        current: i + 1,
        total: seriesList.length,
        label: info.title,
        status: 'skip',
      });
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
        report(options, {
          phase: 'series',
          current: i + 1,
          total: seriesList.length,
          label: info.title,
          status: 'fail',
        });
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
      report(options, {
        phase: 'series',
        current: i + 1,
        total: seriesList.length,
        label: info.title,
        status: 'ok',
      });
    } catch (error) {
      log.warn({ err: error, seriesKey }, 'Series TMDb enrich failed');
      seriesFailed += 1;
      report(options, {
        phase: 'series',
        current: i + 1,
        total: seriesList.length,
        label: info.title,
        status: 'fail',
      });
    }
  }

  const movies = await prisma.media.findMany({
    where: {
      userId: user.id,
      kind: 'movie',
    },
  });

  report(options, {
    phase: 'movies',
    current: 0,
    total: movies.length,
    label: `starting (${movies.length} movies)`,
    status: 'pending',
  });

  for (let i = 0; i < movies.length; i += 1) {
    const movie = movies[i]!;
    if (movie.metadataStatus === 'matched' && movie.posterPath && movie.imdbId) {
      moviesMatched += 1;
      if ((i + 1) % 25 === 0 || i + 1 === movies.length) {
        report(options, {
          phase: 'movies',
          current: i + 1,
          total: movies.length,
          label: movie.title,
          status: 'skip',
        });
      }
      continue;
    }

    report(options, {
      phase: 'movies',
      current: i + 1,
      total: movies.length,
      label: movie.title,
      status: 'pending',
    });

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
        report(options, {
          phase: 'movies',
          current: i + 1,
          total: movies.length,
          label: movie.title,
          status: 'fail',
        });
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
      report(options, {
        phase: 'movies',
        current: i + 1,
        total: movies.length,
        label: movie.title,
        status: 'ok',
      });
    } catch (error) {
      log.warn({ err: error, movieId: movie.id }, 'Movie TMDb enrich failed');
      moviesFailed += 1;
      report(options, {
        phase: 'movies',
        current: i + 1,
        total: movies.length,
        label: movie.title,
        status: 'fail',
      });
    }
  }

  const unmatched = await prisma.media.findMany({
    where: {
      userId: user.id,
      kind: 'unmatched',
    },
    include: {
      files: {
        take: 1,
        select: { name: true },
      },
    },
  });

  report(options, {
    phase: 'unmatched',
    current: 0,
    total: unmatched.length,
    label: `starting (${unmatched.length} unmatched)`,
    status: 'pending',
  });

  for (let i = 0; i < unmatched.length; i += 1) {
    const item = unmatched[i]!;
    const filename = item.files[0]?.name ?? item.title;
    report(options, {
      phase: 'unmatched',
      current: i + 1,
      total: unmatched.length,
      label: filename,
      status: 'pending',
    });

    if (item.metadataStatus === 'matched' && item.posterPath) {
      unmatchedMatched += 1;
      report(options, {
        phase: 'unmatched',
        current: i + 1,
        total: unmatched.length,
        label: filename,
        status: 'skip',
      });
      continue;
    }

    const { title, year } = guessTitleYearForPosterLookup(filename);
    if (title.length < 2) {
      await prisma.media.update({
        where: { id: item.id },
        data: { metadataStatus: 'failed' },
      });
      unmatchedFailed += 1;
      report(options, {
        phase: 'unmatched',
        current: i + 1,
        total: unmatched.length,
        label: `${filename} (no title)`,
        status: 'fail',
      });
      continue;
    }

    try {
      const picked = await pickBestTmdbMatch(tmdb, title, year);
      if (!picked) {
        await prisma.media.update({
          where: { id: item.id },
          data: { metadataStatus: 'failed' },
        });
        unmatchedFailed += 1;
        report(options, {
          phase: 'unmatched',
          current: i + 1,
          total: unmatched.length,
          label: `${filename} → "${title}"`,
          status: 'fail',
        });
        continue;
      }

      const details = await withTmdbThrottle(() =>
        picked.kind === 'movie'
          ? tmdb.getMovieDetails(picked.id)
          : tmdb.getTvDetails(picked.id),
      );

      await prisma.media.update({
        where: { id: item.id },
        data: {
          tmdbId: details.id,
          imdbId: details.imdbId ?? null,
          posterPath: details.posterPath ?? null,
          backdropPath: details.backdropPath ?? null,
          overview: details.overview ?? null,
          genres: details.genres ?? undefined,
          year:
            yearFromDate(details.releaseDate ?? details.firstAirDate) ??
            year ??
            item.year,
          metadataStatus: details.posterPath ? 'matched' : 'failed',
        },
      });

      if (details.posterPath) {
        unmatchedMatched += 1;
        report(options, {
          phase: 'unmatched',
          current: i + 1,
          total: unmatched.length,
          label: `${filename} → "${title}"`,
          status: 'ok',
        });
      } else {
        unmatchedFailed += 1;
        report(options, {
          phase: 'unmatched',
          current: i + 1,
          total: unmatched.length,
          label: `${filename} → "${title}"`,
          status: 'fail',
        });
      }
    } catch (error) {
      log.warn({ err: error, mediaId: item.id, filename }, 'Unmatched TMDb enrich failed');
      unmatchedFailed += 1;
      report(options, {
        phase: 'unmatched',
        current: i + 1,
        total: unmatched.length,
        label: filename,
        status: 'fail',
      });
    }
  }

  log.info(
    {
      seriesMatched,
      seriesFailed,
      moviesMatched,
      moviesFailed,
      unmatchedMatched,
      unmatchedFailed,
    },
    'Metadata enrichment completed',
  );

  return {
    seriesMatched,
    seriesFailed,
    moviesMatched,
    moviesFailed,
    unmatchedMatched,
    unmatchedFailed,
  };
}

async function pickBestTmdbMatch(
  tmdb: ReturnType<typeof createTmdbProvider>,
  title: string,
  year?: number,
): Promise<{ kind: 'movie' | 'tv'; id: number } | null> {
  const movieHit = await withTmdbThrottle(() =>
    tmdb.searchMovie(title, year),
  );
  const tvHit = await withTmdbThrottle(() => tmdb.searchTv(title, year));

  const movieScore = posterScore(movieHit);
  const tvScore = posterScore(tvHit);

  if (movieScore === 0 && tvScore === 0) {
    return movieHit
      ? { kind: 'movie', id: movieHit.id }
      : tvHit
        ? { kind: 'tv', id: tvHit.id }
        : null;
  }

  if (tvScore > movieScore && tvHit) {
    return { kind: 'tv', id: tvHit.id };
  }
  if (movieHit) {
    return { kind: 'movie', id: movieHit.id };
  }
  return tvHit ? { kind: 'tv', id: tvHit.id } : null;
}

function posterScore(hit: TmdbSearchResult | null): number {
  if (!hit?.posterPath) {
    return 0;
  }
  return 1;
}
