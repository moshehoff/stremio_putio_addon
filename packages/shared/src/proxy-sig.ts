import { createHmac, timingSafeEqual } from 'node:crypto';

const DEFAULT_TTL_SECONDS = 4 * 60 * 60;

export function createProxyExpiry(ttlSeconds = DEFAULT_TTL_SECONDS): number {
  return Math.floor(Date.now() / 1000) + ttlSeconds;
}

export function signProxyRequest(
  fileId: number,
  exp: number,
  secret: string,
): string {
  return createHmac('sha256', secret)
    .update(`${fileId}:${exp}`)
    .digest('hex');
}

export function verifyProxySignature(
  fileId: number,
  exp: number,
  sig: string,
  secret: string,
): boolean {
  if (!Number.isFinite(exp) || exp <= Math.floor(Date.now() / 1000)) {
    return false;
  }

  const expected = signProxyRequest(fileId, exp, secret);
  const sigBuf = Buffer.from(sig, 'hex');
  const expectedBuf = Buffer.from(expected, 'hex');

  if (sigBuf.length !== expectedBuf.length) {
    return false;
  }

  return timingSafeEqual(sigBuf, expectedBuf);
}

export function buildProxyUrl(
  baseUrl: string,
  fileId: number,
  secret: string,
  ttlSeconds?: number,
): string {
  const exp = createProxyExpiry(ttlSeconds);
  const sig = signProxyRequest(fileId, exp, secret);
  const url = new URL(`/v1/proxy/${fileId}`, baseUrl);
  url.searchParams.set('exp', String(exp));
  url.searchParams.set('sig', sig);
  return url.toString();
}

export function signSubtitleProxy(
  fileId: number,
  key: string,
  exp: number,
  secret: string,
): string {
  return createHmac('sha256', secret)
    .update(`sub:${fileId}:${key}:${exp}`)
    .digest('hex');
}

export function verifySubtitleProxy(
  fileId: number,
  key: string,
  exp: number,
  sig: string,
  secret: string,
): boolean {
  if (!Number.isFinite(exp) || exp <= Math.floor(Date.now() / 1000)) {
    return false;
  }

  const expected = signSubtitleProxy(fileId, key, exp, secret);
  const sigBuf = Buffer.from(sig, 'hex');
  const expectedBuf = Buffer.from(expected, 'hex');

  if (sigBuf.length !== expectedBuf.length) {
    return false;
  }

  return timingSafeEqual(sigBuf, expectedBuf);
}

export function buildSubtitleProxyUrl(
  baseUrl: string,
  fileId: number,
  key: string,
  lang: string,
  secret: string,
  ttlSeconds?: number,
): string {
  const exp = createProxyExpiry(ttlSeconds);
  const sig = signSubtitleProxy(fileId, key, exp, secret);
  const url = new URL(`/v1/subtitles/${fileId}/${lang}.vtt`, baseUrl);
  url.searchParams.set('key', key);
  url.searchParams.set('exp', String(exp));
  url.searchParams.set('sig', sig);
  return url.toString();
}
