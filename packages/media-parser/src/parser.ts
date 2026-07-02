import { createRequire } from 'node:module';
import type { MediaKind, ParsedMedia } from './types.js';

const require = createRequire(import.meta.url);
const { parse: parseTorrentTitle } = require('parse-torrent-title') as {
  parse: (value: string) => {
    title?: string;
    year?: number;
    season?: number;
    episode?: number;
    resolution?: string;
    source?: string;
    codec?: string;
    group?: string;
  };
};

const EPISODE_PATTERNS = [
  /\bS(\d{1,2})E(\d{1,2})\b/i,
  /\b(\d{1,2})x(\d{1,2})\b/i,
  /\bSeason[\s._-]*(\d{1,2})[\s._-]*Episode[\s._-]*(\d{1,2})\b/i,
];

const RESOLUTION_PATTERN = /\b(2160p|1080p|720p|480p|4K)\b/i;

export function parseMediaFilename(filename: string): ParsedMedia {
  const baseName = stripExtension(filename);
  const parsed = parseTorrentTitle(baseName);

  let season = parsed.season;
  let episode = parsed.episode;

  if (season === undefined || episode === undefined) {
    const match = matchEpisode(baseName);
    if (match) {
      season = match.season;
      episode = match.episode;
    }
  }

  const resolution =
    parsed.resolution ?? baseName.match(RESOLUTION_PATTERN)?.[1]?.toLowerCase();

  if (season !== undefined && episode !== undefined) {
    const showTitle = cleanTitle(parsed.title ?? extractShowTitle(baseName, season, episode));
    return {
      kind: 'episode',
      title: showTitle,
      seriesKey: slugify(showTitle),
      season,
      episode,
      year: parsed.year,
      resolution: normalizeResolution(resolution),
      source: parsed.source,
      codec: parsed.codec,
      releaseGroup: parsed.group,
      rawTitle: baseName,
    };
  }

  const movieTitle = cleanTitle(parsed.title ?? baseName);
  const year = parsed.year ?? extractYear(baseName);

  if (movieTitle.length >= 2 && year) {
    return {
      kind: 'movie',
      title: movieTitle,
      seriesKey: slugify(movieTitle),
      year,
      resolution: normalizeResolution(resolution),
      source: parsed.source,
      codec: parsed.codec,
      releaseGroup: parsed.group,
      rawTitle: baseName,
    };
  }

  return {
    kind: 'unmatched',
    title: baseName,
    rawTitle: baseName,
  };
}

export function slugify(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

export function buildSeriesStremioId(seriesKey: string): string {
  return `putio:series:${seriesKey}`;
}

export function buildEpisodeStremioId(
  seriesKey: string,
  season: number,
  episode: number,
): string {
  return `putio:series:${seriesKey}:${season}:${episode}`;
}

export function buildFolderStremioId(parentId: number): string {
  return `putio:folder:${parentId}`;
}

export function parseFolderStremioId(id: string): number | null {
  const match = id.match(/^putio:folder:(\d+)$/);
  if (!match?.[1]) {
    return null;
  }
  const parentId = Number.parseInt(match[1], 10);
  return Number.isNaN(parentId) ? null : parentId;
}

export function buildFolderSeriesStremioId(
  parentId: number,
  seriesKey: string,
): string {
  return `putio:folder:${parentId}:series:${seriesKey}`;
}

export function parseFolderSeriesStremioId(
  id: string,
): { parentId: number; seriesKey: string } | null {
  const match = id.match(/^putio:folder:(\d+):series:(.+)$/);
  if (!match?.[1] || !match[2]) {
    return null;
  }
  const parentId = Number.parseInt(match[1], 10);
  if (Number.isNaN(parentId)) {
    return null;
  }
  return { parentId, seriesKey: match[2] };
}

export function buildFolderCatalogId(parentId: number): string {
  return `putio_folder_${parentId}`;
}

export function parseFolderCatalogId(id: string): number | null {
  const match = id.match(/^putio_folder_(\d+)$/);
  if (!match?.[1]) {
    return null;
  }
  const parentId = Number.parseInt(match[1], 10);
  return Number.isNaN(parentId) ? null : parentId;
}

function stripExtension(filename: string): string {
  return filename.replace(/\.[a-z0-9]{2,5}$/i, '');
}

function matchEpisode(value: string): { season: number; episode: number } | null {
  for (const pattern of EPISODE_PATTERNS) {
    const match = value.match(pattern);
    if (match?.[1] && match[2]) {
      return {
        season: Number.parseInt(match[1], 10),
        episode: Number.parseInt(match[2], 10),
      };
    }
  }
  return null;
}

function extractShowTitle(
  value: string,
  season: number,
  episode: number,
): string {
  const patterns = [
    new RegExp(`^(.*?)\\.S${season}E${episode}\\b`, 'i'),
    new RegExp(`^(.*?)\\s+S${season}E${episode}\\b`, 'i'),
    new RegExp(`^(.*?)\\s+${season}x${episode}\\b`, 'i'),
  ];

  for (const pattern of patterns) {
    const match = value.match(pattern);
    if (match?.[1]) {
      return cleanTitle(match[1].replace(/[._]+/g, ' '));
    }
  }

  return cleanTitle(value.split(/[._]/)[0] ?? value);
}

function extractYear(value: string): number | undefined {
  const match = value.match(/\b(19|20)\d{2}\b/);
  if (!match) {
    return undefined;
  }
  return Number.parseInt(match[0], 10);
}

function cleanTitle(value: string): string {
  return value
    .replace(/[._]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeResolution(value?: string): string | undefined {
  if (!value) {
    return undefined;
  }
  return value.toLowerCase() === '4k' ? '2160p' : value.toLowerCase();
}
