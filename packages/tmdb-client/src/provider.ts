const TMDB_API_BASE = 'https://api.themoviedb.org/3';
const TMDB_IMAGE_BASE = 'https://image.tmdb.org/t/p';

export const TMDB_POSTER_SIZE = 'w500';
export const TMDB_BACKDROP_SIZE = 'w1280';

export interface TmdbSearchResult {
  id: number;
  name?: string;
  title?: string;
  overview?: string;
  posterPath?: string | null;
  backdropPath?: string | null;
  releaseDate?: string;
  firstAirDate?: string;
}

export interface TmdbDetails {
  id: number;
  imdbId?: string | null;
  overview?: string;
  posterPath?: string | null;
  backdropPath?: string | null;
  genres?: Array<{ id: number; name: string }>;
  releaseDate?: string;
  firstAirDate?: string;
}

export interface TmdbProvider {
  searchMovie(title: string, year?: number): Promise<TmdbSearchResult | null>;
  searchTv(title: string, year?: number): Promise<TmdbSearchResult | null>;
  getMovieDetails(id: number): Promise<TmdbDetails>;
  getTvDetails(id: number): Promise<TmdbDetails>;
}

export function createTmdbProvider(apiKey: string): TmdbProvider {
  return new TmdbHttpClient(apiKey);
}

export function tmdbPosterUrl(path: string | null | undefined): string | null {
  if (!path) {
    return null;
  }
  return `${TMDB_IMAGE_BASE}/${TMDB_POSTER_SIZE}${path}`;
}

export function tmdbBackdropUrl(path: string | null | undefined): string | null {
  if (!path) {
    return null;
  }
  return `${TMDB_IMAGE_BASE}/${TMDB_BACKDROP_SIZE}${path}`;
}

class TmdbHttpClient implements TmdbProvider {
  constructor(private readonly apiKey: string) {}

  async searchMovie(title: string, year?: number): Promise<TmdbSearchResult | null> {
    const params: Record<string, string> = {
      query: title,
      include_adult: 'false',
    };
    if (year) {
      params.year = String(year);
    }

    const data = await this.get<{ results?: RawSearchItem[] }>('/search/movie', params);
    const best = data.results?.[0];
    return best ? mapSearchResult(best) : null;
  }

  async searchTv(title: string, year?: number): Promise<TmdbSearchResult | null> {
    const params: Record<string, string> = {
      query: title,
      include_adult: 'false',
    };
    if (year) {
      params.first_air_date_year = String(year);
    }

    const data = await this.get<{ results?: RawSearchItem[] }>('/search/tv', params);
    const best = data.results?.[0];
    return best ? mapSearchResult(best) : null;
  }

  async getMovieDetails(id: number): Promise<TmdbDetails> {
    const data = await this.get<RawMovieDetails>(`/movie/${id}`, {
      append_to_response: 'external_ids',
    });
    return mapMovieDetails(data);
  }

  async getTvDetails(id: number): Promise<TmdbDetails> {
    const data = await this.get<RawTvDetails>(`/tv/${id}`, {
      append_to_response: 'external_ids',
    });
    return mapTvDetails(data);
  }

  private async get<T>(
    path: string,
    params: Record<string, string> = {},
  ): Promise<T> {
    const url = new URL(`${TMDB_API_BASE}${path}`);
    url.searchParams.set('api_key', this.apiKey);
    for (const [key, value] of Object.entries(params)) {
      url.searchParams.set(key, value);
    }

    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`TMDb request failed: ${response.status}`);
    }

    return (await response.json()) as T;
  }
}

type RawSearchItem = {
  id: number;
  title?: string;
  name?: string;
  overview?: string;
  poster_path?: string | null;
  backdrop_path?: string | null;
  release_date?: string;
  first_air_date?: string;
};

type RawMovieDetails = {
  id: number;
  overview?: string;
  poster_path?: string | null;
  backdrop_path?: string | null;
  genres?: Array<{ id: number; name: string }>;
  release_date?: string;
  external_ids?: { imdb_id?: string | null };
};

type RawTvDetails = {
  id: number;
  overview?: string;
  poster_path?: string | null;
  backdrop_path?: string | null;
  genres?: Array<{ id: number; name: string }>;
  first_air_date?: string;
  external_ids?: { imdb_id?: string | null };
};

function mapSearchResult(item: RawSearchItem): TmdbSearchResult {
  return {
    id: item.id,
    title: item.title,
    name: item.name,
    overview: item.overview,
    posterPath: item.poster_path,
    backdropPath: item.backdrop_path,
    releaseDate: item.release_date,
    firstAirDate: item.first_air_date,
  };
}

function mapMovieDetails(item: RawMovieDetails): TmdbDetails {
  return {
    id: item.id,
    imdbId: item.external_ids?.imdb_id ?? null,
    overview: item.overview,
    posterPath: item.poster_path,
    backdropPath: item.backdrop_path,
    genres: item.genres,
    releaseDate: item.release_date,
  };
}

function mapTvDetails(item: RawTvDetails): TmdbDetails {
  return {
    id: item.id,
    imdbId: item.external_ids?.imdb_id ?? null,
    overview: item.overview,
    posterPath: item.poster_path,
    backdropPath: item.backdrop_path,
    genres: item.genres,
    firstAirDate: item.first_air_date,
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function withTmdbThrottle<T>(
  fn: () => Promise<T>,
  delayMs = 260,
): Promise<T> {
  const result = await fn();
  await sleep(delayMs);
  return result;
}
