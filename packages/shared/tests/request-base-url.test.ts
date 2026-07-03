import { describe, expect, it } from 'vitest';
import { resolveRequestBaseUrl } from '../src/request-base-url.js';

describe('resolveRequestBaseUrl', () => {
  const fallback = 'http://127.0.0.1:7000';

  it('uses LAN host from request for Android clients', () => {
    expect(
      resolveRequestBaseUrl(
        { headers: { host: '192.168.1.42:7000' } },
        fallback,
      ),
    ).toBe('http://192.168.1.42:7000');
  });

  it('uses PUBLIC_BASE_URL when host is loopback', () => {
    expect(
      resolveRequestBaseUrl(
        { headers: { host: '127.0.0.1:7000' } },
        fallback,
        { publicBaseUrl: 'https://addon.example.com' },
      ),
    ).toBe('https://addon.example.com');
  });

  it('forces https for trycloudflare tunnel hosts', () => {
    expect(
      resolveRequestBaseUrl(
        { headers: { host: 'abc.trycloudflare.com' } },
        fallback,
      ),
    ).toBe('https://abc.trycloudflare.com');
  });

  it('keeps loopback host for desktop Stremio installs', () => {
    expect(
      resolveRequestBaseUrl(
        { headers: { host: '127.0.0.1:7000' } },
        fallback,
      ),
    ).toBe('http://127.0.0.1:7000');
  });

  it('respects x-forwarded headers', () => {
    expect(
      resolveRequestBaseUrl(
        {
          headers: {
            host: '127.0.0.1:7000',
            'x-forwarded-host': '192.168.0.10:7000',
            'x-forwarded-proto': 'http',
          },
        },
        fallback,
      ),
    ).toBe('http://192.168.0.10:7000');
  });
});
