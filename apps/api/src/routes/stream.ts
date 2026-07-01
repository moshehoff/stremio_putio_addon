import type { FastifyInstance } from 'fastify';
import {
  buildProxyUrl,
  getEnv,
  NotFoundError,
  requireSecretKey,
} from '@putio-stremio/shared';
import { resolveVideoToPutioFile } from '@putio-stremio/db';

const CACHE_STREAM = 'public, max-age=300';

export interface StremioStream {
  name: string;
  title?: string;
  url: string;
  behaviorHints?: {
    notWebReady?: boolean;
    bingeGroup?: string;
  };
}

export async function registerStreamRoutes(app: FastifyInstance) {
  app.get('/stream/:type/:videoId.json', async (request, reply) => {
    const { type, videoId } = request.params as {
      type: string;
      videoId: string;
    };

    if (type !== 'series' && type !== 'movie') {
      throw new NotFoundError('Unsupported stream type');
    }

    if (!videoId.startsWith('putio:')) {
      throw new NotFoundError('Unsupported video id');
    }

    const env = getEnv();
    const secret = requireSecretKey();
    const file = await resolveVideoToPutioFile(videoId);
    const proxyUrl = buildProxyUrl(env.BASE_URL, file.putioFileId, secret);

    const streams: StremioStream[] = [
      {
        name: 'Put.io',
        title: file.name,
        url: proxyUrl,
        behaviorHints: {
          notWebReady: file.notWebReady,
          bingeGroup: 'putio',
        },
      },
    ];

    return reply.header('Cache-Control', CACHE_STREAM).send({ streams });
  });
}
