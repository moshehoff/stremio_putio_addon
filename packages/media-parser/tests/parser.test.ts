import { describe, expect, it } from 'vitest';
import {
  buildEpisodeStremioId,
  buildSeriesStremioId,
  parseMediaFilename,
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

describe('stremio ids', () => {
  it('builds series and episode ids', () => {
    expect(buildSeriesStremioId('friends')).toBe('putio:series:friends');
    expect(buildEpisodeStremioId('friends', 4, 8)).toBe(
      'putio:series:friends:4:8',
    );
  });
});
