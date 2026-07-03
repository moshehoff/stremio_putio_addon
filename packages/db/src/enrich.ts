import type { TmdbSearchResult } from '@putio-stremio/tmdb-client';
import { createTmdbProvider, withTmdbThrottle } from '@putio-stremio/tmdb-client';
import { guessTitleYearForPosterLookup } from '@putio-stremio/media-parser';
import { createLogger, getEnv, requireTmdbApiKey } from '@putio-stremio/shared';
import { prisma } from './client.js';
import { getDefaultUser } from './parse.js';
import { yearFromDate } from './posters.js';

const log = createLogger('enrich');

const PENDING_STATUSES = ['pending', 'unknown'] as const;
const SETTLED_STATUSES = ['matched', 'failed'] as const;

export interface EnrichResult {
  seriesMatched: number;
  seriesFailed: number;
  seriesSkipped: number;
  moviesMatched: number;
  moviesFailed: number;
  moviesSkipped: number;
  unmatchedMatched: number;
  unmatchedFailed: number;
  unmatchedSkipped: number;
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
  quiet?: boolean;
}

function report(
  options: EnrichOptions | undefined,
  progress: EnrichProgress,
): void {
  if (options?.quiet) {
    return;
  }
  options?.onProgress?.(progress);
}

function isSettledStatus(status: string): boolean {
  return (SETTLED_STATUSES as readonly string[]).includes(status);
}

/** Enrich only items not already matched or failed in the DB. */
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
  let seriesSkipped = 0;
  let moviesMatched = 0;
  let moviesFailed = 0;
  let moviesSkipped = 0;
  let unmatchedMatched = 0;
  let unmatchedFailed = 0;
  let unmatchedSkipped = 0;

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

  const allSeriesKeys = [...seriesMap.keys()];
  const existingSeriesMeta =
    allSeriesKeys.length > 0
      ? await prisma.seriesMeta.findMany({
          where: {
            userId: user.id,
            seriesKey: { in: allSeriesKeys },
          },
        })
      : [];
  const seriesMetaByKey = new Map(
    existingSeriesMeta.map((row) => [row.seriesKey, row]),
  );

  const seriesToEnrich = allSeriesKeys
    .map((seriesKey) => {
      const info = seriesMap.get(seriesKey)!;
      const existing = seriesMetaByKey.get(seriesKey);
      if (existing && isSettledStatus(existing.metadataStatus)) {
        if (existing.metadataStatus === 'matched') {
          seriesMatched += 1;
        } else {
          seriesFailed += 1;
        }
        seriesSkipped += 1;
        return null;
      }
      return { seriesKey, info };
    })
    .filter((row): row is NonNullable<typeof row> => row !== null);

  report(options, {
    phase: 'series',
    current: 0,
    total: seriesToEnrich.length,
    label: `starting (${seriesToEnrich.length} pending, ${seriesSkipped} cached)`,
    status: 'pending',
  });

  for (let i = 0; i < seriesToEnrich.length; i += 1) {
    const { seriesKey, info } = seriesToEnrich[i]!;
    report(options, {
      phase: 'series',
      current: i + 1,
      total: seriesToEnrich.length,
      label: info.title,
      status: 'pending',
    });

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
          total: seriesToEnrich.length,
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
        total: seriesToEnrich.length,
        label: info.title,
        status: 'ok',
      });
    } catch (error) {
      log.warn({ err: error, seriesKey }, 'Series TMDb enrich failed');
      seriesFailed += 1;
      report(options, {
        phase: 'series',
        current: i + 1,
        total: seriesToEnrich.length,
        label: info.title,
        status: 'fail',
      });
    }
  }

  moviesSkipped = await prisma.media.count({
    where: {
      userId: user.id,
      kind: 'movie',
      metadataStatus: { in: [...SETTLED_STATUSES] },
    },
  });
  moviesMatched = await prisma.media.count({
    where: {
      userId: user.id,
      kind: 'movie',
      metadataStatus: 'matched',
    },
  });

  const movies = await prisma.media.findMany({
    where: {
      userId: user.id,
      kind: 'movie',
      metadataStatus: { in: [...PENDING_STATUSES] },
    },
  });

  report(options, {
    phase: 'movies',
    current: 0,
    total: movies.length,
    label: `starting (${movies.length} pending, ${moviesSkipped} cached)`,
    status: 'pending',
  });

  for (let i = 0; i < movies.length; i += 1) {
    const movie = movies[i]!;
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

  unmatchedSkipped = await prisma.media.count({
    where: {
      userId: user.id,
      kind: 'unmatched',
      metadataStatus: { in: [...SETTLED_STATUSES] },
    },
  });
  unmatchedMatched = await prisma.media.count({
    where: {
      userId: user.id,
      kind: 'unmatched',
      metadataStatus: 'matched',
    },
  });

  const unmatched = await prisma.media.findMany({
    where: {
      userId: user.id,
      kind: 'unmatched',
      metadataStatus: { in: [...PENDING_STATUSES] },
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
    label: `starting (${unmatched.length} pending, ${unmatchedSkipped} cached)`,
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
      seriesSkipped,
      moviesMatched,
      moviesFailed,
      moviesSkipped,
      unmatchedMatched,
      unmatchedFailed,
      unmatchedSkipped,
    },
    'Metadata enrichment completed',
  );

  return {
    seriesMatched,
    seriesFailed,
    seriesSkipped,
    moviesMatched,
    moviesFailed,
    moviesSkipped,
    unmatchedMatched,
    unmatchedFailed,
    unmatchedSkipped,
  };
}

/** Run enrich when TMDB_API_KEY is set; no-op otherwise. */
export async function enrichIfConfigured(
  options?: EnrichOptions,
): Promise<EnrichResult | null> {
  if (!getEnv().TMDB_API_KEY) {
    return null;
  }
  return enrichLibraryMetadata({ quiet: true, ...options });
}

async function pickBestTmdbMatch(
  tmdb: ReturnType<typeof createTmdbProvider>,
  title: string,
  year?: number,
): Promise<{ kind: 'movie' | 'tv'; id: number } | null> {
  const movieHit = await withTmdbThrottle(() =>
    tmdb.searchMovie(title, year),
  );
  const tvHit = await withTmdbThrottle(() =>
    tmdb.searchTv(title, year),
  );

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
