import type { FastifyInstance } from 'fastify';
import { createPutioProvider } from '@putio-stremio/putio-client';
import {
  ForbiddenError,
  NotFoundError,
  requirePutioToken,
  requireSecretKey,
  verifyProxySignature,
} from '@putio-stremio/shared';

const FORWARDED_HEADERS = [
  'content-type',
  'content-length',
  'content-range',
  'accept-ranges',
];

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

    const putio = createPutioProvider(requirePutioToken());
    const putioUrl = await putio.getDownloadUrl(putioFileId);

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
  });
}
