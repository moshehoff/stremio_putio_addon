import { describe, expect, it } from 'vitest';
import { isWebOsUserAgent } from '../src/client-detect.js';

describe('isWebOsUserAgent', () => {
  it('detects LG webOS user agents', () => {
    expect(
      isWebOsUserAgent(
        'Mozilla/5.0 (Web0S; Linux/SmartTV) AppleWebKit/537.36',
      ),
    ).toBe(true);
  });

  it('returns false for desktop chrome', () => {
    expect(
      isWebOsUserAgent(
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0',
      ),
    ).toBe(false);
  });
});
