import { describe, expect, it } from 'vitest';
import {
  buildEpisodeFileStremioId,
  buildEpisodeStremioId,
  parseEpisodeFileStremioId,
  buildFolderCatalogId,
  buildFolderSeriesStremioId,
  buildFolderStremioId,
  buildSeriesStremioId,
  parseFolderCatalogId,
  parseFolderSeriesStremioId,
  parseFolderStremioId,
  parseMediaFilename,
  guessTitleYearForPosterLookup,
} from '../src/parser.js';

describe('parseMediaFilename', () => {
  it('parses standard SxxExx torrent names', () => {
    const result = parseMediaFilename('Friends.S04E08.720p.BRRip.x264.mkv');
    expect(result.kind).toBe('episode');
    expect(result.title).toBe('Friends');
    expect(result.seriesKey).toBe('friends');
    expect(result.season).toBe(4);
    expect(result.episode).toBe(8);
    expect(result.resolution).toBe('720p');
  });

  it('parses 1x02 style names', () => {
    const result = parseMediaFilename('Breaking Bad 1x02.1080p.mkv');
    expect(result.kind).toBe('episode');
    expect(result.season).toBe(1);
    expect(result.episode).toBe(2);
  });

  it('parses BlazeAnime dash-episode names', () => {
    const result = parseMediaFilename(
      'One Punch Man - 01 [1080p] [HEVC x265 10bit][dual audio][BlazeAnime].mkv',
    );
    expect(result.kind).toBe('episode');
    expect(result.title).toBe('One Punch Man');
    expect(result.seriesKey).toBe('one-punch-man');
    expect(result.season).toBe(1);
    expect(result.episode).toBe(1);
  });

  it('parses movie names with year', () => {
    const result = parseMediaFilename('Alien.Romulus.2024.2160p.WEB-DL.mkv');
    expect(result.kind).toBe('movie');
    expect(result.year).toBe(2024);
  });

  it('marks unknown files as unmatched', () => {
    const result = parseMediaFilename('random_clip.mp4');
    expect(result.kind).toBe('unmatched');
  });
});

describe('guessTitleYearForPosterLookup', () => {
  it('extracts title and year from parenthetical year prefix', () => {
    const result = guessTitleYearForPosterLookup(
      '(1968) Planet Of The Apes 1080p (moviesbyrizzo upl).mp4',
    );
    expect(result.title).toBe('Planet Of The Apes');
    expect(result.year).toBe(1968);
  });

  it('extracts title and year from standard movie filename', () => {
    const result = guessTitleYearForPosterLookup('Alien.Romulus.2024.2160p.WEB-DL.mkv');
    expect(result.title).toBe('Alien Romulus');
    expect(result.year).toBe(2024);
  });
});

describe('stremio ids', () => {
  it('builds series and episode ids', () => {
    expect(buildSeriesStremioId('friends')).toBe('putio:series:friends');
    expect(buildEpisodeStremioId('friends', 4, 8)).toBe(
      'putio:series:friends:4:8',
    );
    expect(buildEpisodeFileStremioId(12345)).toBe('putio:episode:12345');
    expect(parseEpisodeFileStremioId('putio:episode:12345')).toBe(12345);
    expect(parseEpisodeFileStremioId('putio:series:friends:4:8')).toBeNull();
  });

  it('builds and parses folder ids', () => {
    expect(buildFolderStremioId(12345)).toBe('putio:folder:12345');
    expect(parseFolderStremioId('putio:folder:12345')).toBe(12345);
    expect(parseFolderStremioId('putio:folder:12345:series:friends')).toBeNull();
    expect(buildFolderCatalogId(99)).toBe('putio_folder_99');
    expect(parseFolderCatalogId('putio_folder_99')).toBe(99);
    expect(buildFolderSeriesStremioId(99, 'friends')).toBe(
      'putio:folder:99:series:friends',
    );
    expect(parseFolderSeriesStremioId('putio:folder:99:series:friends')).toEqual({
      parentId: 99,
      seriesKey: 'friends',
    });
    expect(parseFolderSeriesStremioId('putio:series:friends')).toBeNull();
  });
});
