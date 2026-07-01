export type MediaKind = 'episode' | 'movie' | 'unmatched';

export interface ParsedMedia {
  kind: MediaKind;
  title: string;
  seriesKey?: string;
  season?: number;
  episode?: number;
  year?: number;
  resolution?: string;
  source?: string;
  codec?: string;
  releaseGroup?: string;
  rawTitle: string;
}
