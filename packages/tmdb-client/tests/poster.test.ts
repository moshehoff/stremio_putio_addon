import { describe, expect, it } from 'vitest';
import { tmdbPosterUrl } from '../src/provider.js';

describe('tmdbPosterUrl', () => {
  it('builds poster URL from path', () => {
    expect(tmdbPosterUrl('/abc.jpg')).toBe(
      'https://image.tmdb.org/t/p/w500/abc.jpg',
    );
    expect(tmdbPosterUrl(null)).toBeNull();
  });
});
