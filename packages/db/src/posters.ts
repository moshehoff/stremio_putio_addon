import { tmdbPosterUrl } from '@putio-stremio/tmdb-client';

export const PLACEHOLDER_POSTER =
  'https://www.strem.io/images/addon_default.png';

export function resolvePosterUrl(posterPath: string | null | undefined): string {
  return tmdbPosterUrl(posterPath) ?? PLACEHOLDER_POSTER;
}

export function resolveBackdropUrl(
  backdropPath: string | null | undefined,
): string | undefined {
  if (!backdropPath) {
    return undefined;
  }
  return `https://image.tmdb.org/t/p/w1280${backdropPath}`;
}

export function yearFromDate(value?: string | null): number | undefined {
  if (!value) {
    return undefined;
  }
  const year = Number.parseInt(value.slice(0, 4), 10);
  return Number.isFinite(year) ? year : undefined;
}
