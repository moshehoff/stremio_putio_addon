import type { FastifyInstance } from 'fastify';
import {
  buildProxyUrl,
  getEnv,
  NotFoundError,
  requireSecretKey,
  resolveRequestBaseUrl,
} from '@putio-stremio/shared';
import { resolveVideoToPutioFile, resolveLibraryUserId } from '@putio-stremio/db';
import { buildStremioStreams } from '../services/streams.js';

const CACHE_STREAM = 'public, max-age=300';

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
    const userId = await resolveLibraryUserId();
    if (!userId) {
      throw new NotFoundError('No library user');
    }

    const secret = requireSecretKey();
    const file = await resolveVideoToPutioFile(videoId, userId);
    const baseUrl = resolveRequestBaseUrl(request, env.BASE_URL, {
      publicBaseUrl: env.PUBLIC_BASE_URL,
    });
    const userAgent = request.headers['user-agent'];
    const streams = await buildStremioStreams(
      file,
      baseUrl,
      secret,
      typeof userAgent === 'string' ? userAgent : undefined,
      userId,
    );

    return reply.header('Cache-Control', CACHE_STREAM).send({ streams });
  });
}
