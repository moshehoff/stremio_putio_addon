import { describe, expect, it } from 'vitest';
import {
  buildProxyUrl,
  createProxyExpiry,
  signProxyRequest,
  verifyProxySignature,
} from '../src/proxy-sig.js';

describe('proxy-sig', () => {
  const secret = 'test-secret-key';

  it('signs and verifies a proxy request', () => {
    const exp = createProxyExpiry(3600);
    const sig = signProxyRequest(12345, exp, secret);

    expect(verifyProxySignature(12345, exp, sig, secret)).toBe(true);
    expect(verifyProxySignature(12345, exp, 'bad-sig', secret)).toBe(false);
    expect(verifyProxySignature(99999, exp, sig, secret)).toBe(false);
  });

  it('rejects expired signatures', () => {
    const exp = Math.floor(Date.now() / 1000) - 10;
    const sig = signProxyRequest(1, exp, secret);
    expect(verifyProxySignature(1, exp, sig, secret)).toBe(false);
  });

  it('builds a proxy URL with query params', () => {
    const url = buildProxyUrl('http://localhost:7000', 42, secret, 3600);
    const parsed = new URL(url);
    expect(parsed.pathname).toBe('/v1/proxy/42');
    expect(parsed.searchParams.get('exp')).toBeTruthy();
    expect(parsed.searchParams.get('sig')).toMatch(/^[a-f0-9]{64}$/);
  });
});
