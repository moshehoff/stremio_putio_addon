import type { FastifyInstance } from 'fastify';
import { createPutioProvider } from '@putio-stremio/putio-client';
import { requirePutioAccessToken } from '@putio-stremio/db';
import {
  ForbiddenError,
  NotFoundError,
  requireSecretKey,
  verifyMp4ProxySignature,
  verifyProxySignature,
  verifySubtitleProxySignature,
} from '@putio-stremio/shared';

const FORWARDED_HEADERS = [
  'content-type',
  'content-length',
  'content-range',
  'accept-ranges',
];

async function proxyPutioUrl(
  putioUrl: string,
  request: { headers: Record<string, string | string[] | undefined> },
  reply: { status: (code: number) => unknown; header: (name: string, value: string) => unknown; send: (body?: unknown) => unknown },
) {
  const upstreamHeaders: Record<string, string> = {};
  const range = request.headers.range;
  if (typeof range === 'string') {
    upstreamHeaders.Range = range;
  }

  const upstream = await fetch(putioUrl, { headers: upstreamHeaders });

  if (!upstream.ok && upstream.status !== 206) {
    throw new NotFoundError(`Upstream returned ${upstream.status}`);
  }

  reply.status(upstream.status);
  reply.header('Access-Control-Allow-Origin', '*');
  reply.header('Accept-Ranges', 'bytes');

  for (const name of FORWARDED_HEADERS) {
    const value = upstream.headers.get(name);
    if (value) {
      reply.header(name, value);
    }
  }

  if (!upstream.body) {
    return reply.send();
  }

  return reply.send(upstream.body);
}

export async function registerProxyRoutes(app: FastifyInstance) {
  app.get('/v1/proxy/:fileId', async (request, reply) => {
    const { fileId } = request.params as { fileId: string };
    const query = request.query as { exp?: string; sig?: string };

    const putioFileId = Number.parseInt(fileId, 10);
    if (!Number.isFinite(putioFileId) || putioFileId <= 0) {
      throw new NotFoundError('Invalid file id');
    }

    const exp = Number.parseInt(query.exp ?? '', 10);
    const sig = query.sig ?? '';
    const secret = requireSecretKey();

    if (!verifyProxySignature(putioFileId, exp, sig, secret)) {
      throw new ForbiddenError('Invalid or expired proxy signature');
    }

    const putio = createPutioProvider(await requirePutioAccessToken());
    const putioUrl = await putio.getDownloadUrl(putioFileId);

    return proxyPutioUrl(putioUrl, request, reply);
  });

  app.get('/v1/proxy/:fileId/mp4', async (request, reply) => {
    const { fileId } = request.params as { fileId: string };
    const query = request.query as { exp?: string; sig?: string; parent_id?: string };

    const putioFileId = Number.parseInt(fileId, 10);
    const parentId = Number.parseInt(query.parent_id ?? '', 10);
    if (!Number.isFinite(putioFileId) || putioFileId <= 0) {
      throw new NotFoundError('Invalid file id');
    }
    if (!Number.isFinite(parentId)) {
      throw new NotFoundError('Invalid parent id');
    }

    const exp = Number.parseInt(query.exp ?? '', 10);
    const sig = query.sig ?? '';
    const secret = requireSecretKey();

    if (!verifyMp4ProxySignature(putioFileId, parentId, exp, sig, secret)) {
      throw new ForbiddenError('Invalid or expired proxy signature');
    }

    const putio = createPutioProvider(await requirePutioAccessToken());
    const mp4 = await putio.getMp4PlaybackInfo(putioFileId, parentId);

    if (!mp4.available || !mp4.streamUrl) {
      throw new NotFoundError('MP4 stream is not available for this file');
    }

    return proxyPutioUrl(mp4.streamUrl, request, reply);
  });

  app.get('/v1/subtitles/:fileId/:subtitleKey', async (request, reply) => {
    const { fileId, subtitleKey } = request.params as {
      fileId: string;
      subtitleKey: string;
    };
    const query = request.query as { exp?: string; sig?: string };

    const putioFileId = Number.parseInt(fileId, 10);
    const decodedKey = decodeURIComponent(subtitleKey).replace(/\.vtt$/i, '');
    if (!Number.isFinite(putioFileId) || putioFileId <= 0 || !decodedKey) {
      throw new NotFoundError('Invalid subtitle request');
    }

    const exp = Number.parseInt(query.exp ?? '', 10);
    const sig = query.sig ?? '';
    const secret = requireSecretKey();

    if (!verifySubtitleProxySignature(putioFileId, decodedKey, exp, sig, secret)) {
      throw new ForbiddenError('Invalid or expired subtitle signature');
    }

    const putio = createPutioProvider(await requirePutioAccessToken());
    const content = await putio.getSubtitleContent(putioFileId, decodedKey, 'webvtt');

    return reply
      .header('Content-Type', 'text/vtt; charset=utf-8')
      .header('Access-Control-Allow-Origin', '*')
      .header('Cache-Control', 'public, max-age=3600')
      .send(content);
  });
}
