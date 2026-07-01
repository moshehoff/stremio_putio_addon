import { describe, expect, it } from 'vitest';
import { buildContentHash } from '../src/hash.js';

describe('buildContentHash', () => {
  it('returns sha256 hex digest', () => {
    const hash = buildContentHash({
      id: 1,
      name: 'Show.S01E01.mkv',
      size: 1000,
      crc32: 'abc',
    });
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
    expect(
      buildContentHash({
        id: 1,
        name: 'Show.S01E01.mkv',
        size: 1000,
        crc32: 'abc',
      }),
    ).toBe(hash);
  });
});
