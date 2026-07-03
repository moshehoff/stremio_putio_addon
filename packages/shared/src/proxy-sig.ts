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

export function signMp4ProxyRequest(
  fileId: number,
  parentId: number,
  exp: number,
  secret: string,
): string {
  return createHmac('sha256', secret)
    .update(`mp4:${fileId}:${parentId}:${exp}`)
    .digest('hex');
}

export function verifyMp4ProxySignature(
  fileId: number,
  parentId: number,
  exp: number,
  sig: string,
  secret: string,
): boolean {
  if (!Number.isFinite(exp) || exp <= Math.floor(Date.now() / 1000)) {
    return false;
  }

  const expected = signMp4ProxyRequest(fileId, parentId, exp, secret);
  const sigBuf = Buffer.from(sig, 'hex');
  const expectedBuf = Buffer.from(expected, 'hex');

  if (sigBuf.length !== expectedBuf.length) {
    return false;
  }

  return timingSafeEqual(sigBuf, expectedBuf);
}

export function buildMp4ProxyUrl(
  baseUrl: string,
  fileId: number,
  parentId: number,
  secret: string,
  ttlSeconds?: number,
): string {
  const exp = createProxyExpiry(ttlSeconds);
  const sig = signMp4ProxyRequest(fileId, parentId, exp, secret);
  const url = new URL(`/v1/proxy/${fileId}/mp4`, baseUrl);
  url.searchParams.set('parent_id', String(parentId));
  url.searchParams.set('exp', String(exp));
  url.searchParams.set('sig', sig);
  return url.toString();
}

export function signSubtitleProxyRequest(
  fileId: number,
  subtitleKey: string,
  exp: number,
  secret: string,
): string {
  return createHmac('sha256', secret)
    .update(`sub:${fileId}:${subtitleKey}:${exp}`)
    .digest('hex');
}

export function verifySubtitleProxySignature(
  fileId: number,
  subtitleKey: string,
  exp: number,
  sig: string,
  secret: string,
): boolean {
  if (!Number.isFinite(exp) || exp <= Math.floor(Date.now() / 1000)) {
    return false;
  }

  const expected = signSubtitleProxyRequest(fileId, subtitleKey, exp, secret);
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
  subtitleKey: string,
  secret: string,
  ttlSeconds?: number,
): string {
  const exp = createProxyExpiry(ttlSeconds);
  const sig = signSubtitleProxyRequest(fileId, subtitleKey, exp, secret);
  const url = new URL(
    `/v1/subtitles/${fileId}/${encodeURIComponent(subtitleKey)}.vtt`,
    baseUrl,
  );
  url.searchParams.set('exp', String(exp));
  url.searchParams.set('sig', sig);
  return url.toString();
}
