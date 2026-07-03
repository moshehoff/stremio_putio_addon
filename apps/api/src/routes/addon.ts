import type { FastifyInstance, FastifyRequest } from 'fastify';
import { NotFoundError, normalizeBaseUrl } from '@putio-stremio/shared';
import {
  parseFolderCatalogId,
  parseFolderSeriesStremioId,
} from '@putio-stremio/media-parser';
import {
  getMovieMeta,
  getRawMediaMeta,
  getFolderMediaCatalog,
  getFolderSeriesMeta,
  parseCatalogExtra,
  resolveLibraryUserId,
  resolveVideoToPutioFile,
} from '@putio-stremio/db';
import {
  getEnv,
  requireSecretKey,
  resolveRequestBaseUrl,
} from '@putio-stremio/shared';
import { buildStremioStreams } from '../services/streams.js';
import { buildManifest } from '../manifest-builder.js';

const CACHE_CATALOG = 'public, max-age=300';
const CACHE_META = 'public, max-age=86400';
const CACHE_STREAM = 'public, max-age=300';
const CACHE_MANIFEST = 'public, max-age=300';

type RequestWithUser = FastifyRequest & { libraryUserId?: string };

async function resolveCatalog(
  type: string,
  id: string,
  extra: ReturnType<typeof parseCatalogExtra>,
  userId: string,
) {
  if (type === 'series' && parseFolderCatalogId(id) !== null) {
    return getFolderMediaCatalog(id, extra, userId);
  }

  return [];
}

async function resolveMeta(type: string, id: string, userId: string) {
  if (type === 'series' && parseFolderSeriesStremioId(id)) {
    return getFolderSeriesMeta(id, userId);
  }

  if (type === 'movie' && id.startsWith('putio:raw:')) {
    return getRawMediaMeta(id, userId);
  }

  if (type === 'movie') {
    return getMovieMeta(id, userId);
  }

  return null;
}

function streamBaseUrl(
  request: FastifyRequest,
  pathPrefix = '',
): string {
  const env = getEnv();
  return normalizeBaseUrl(
    `${resolveRequestBaseUrl(request, env.BASE_URL)}${pathPrefix}`,
  );
}

export async function registerDefaultAddonRoutes(app: FastifyInstance) {
  app.get('/manifest.json', async (_request, reply) => {
    const manifest = await buildManifest();
    return reply.header('Cache-Control', CACHE_MANIFEST).send(manifest);
  });

  app.get('/catalog/:type/:id.json', async (request, reply) => {
    const { type, id } = request.params as { type: string; id: string };
    const userId = await resolveLibraryUserId();
    if (!userId) {
      return reply.header('Cache-Control', CACHE_CATALOG).send({ metas: [] });
    }
    const metas = await resolveCatalog(type, id, {}, userId);
    return reply.header('Cache-Control', CACHE_CATALOG).send({ metas });
  });

  app.get('/catalog/:type/:id/:extra.json', async (request, reply) => {
    const { type, id, extra } = request.params as {
      type: string;
      id: string;
      extra: string;
    };
    const userId = await resolveLibraryUserId();
    if (!userId) {
      return reply.header('Cache-Control', CACHE_CATALOG).send({ metas: [] });
    }
    const metas = await resolveCatalog(type, id, parseCatalogExtra(extra), userId);
    return reply.header('Cache-Control', CACHE_CATALOG).send({ metas });
  });

  app.get('/meta/:type/:id.json', async (request, reply) => {
    const { type, id } = request.params as { type: string; id: string };
    const userId = await resolveLibraryUserId();
    if (!userId) {
      throw new NotFoundError('No library user');
    }
    const meta = await resolveMeta(type, id, userId);
    if (!meta) {
      throw new NotFoundError('Unsupported meta type');
    }
    return reply.header('Cache-Control', CACHE_META).send({ meta });
  });

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

    const userId = await resolveLibraryUserId();
    if (!userId) {
      throw new NotFoundError('No library user');
    }

    const secret = requireSecretKey();
    const file = await resolveVideoToPutioFile(videoId, userId);
    const streams = await buildStremioStreams(
      file,
      streamBaseUrl(request),
      secret,
      typeof request.headers['user-agent'] === 'string'
        ? request.headers['user-agent']
        : undefined,
    );

    return reply.header('Cache-Control', CACHE_STREAM).send({ streams });
  });
}

export async function registerPerUserAddonRoutes(app: FastifyInstance) {
  await app.register(async (userApp) => {
    userApp.addHook('preHandler', async (request) => {
      const params = request.params as { userSlug?: string };
      if (!params.userSlug) {
        throw new NotFoundError('User slug is required');
      }
      const userId = await resolveLibraryUserId(params.userSlug);
      if (!userId) {
        throw new NotFoundError('Library user not found');
      }
      (request as RequestWithUser).libraryUserId = userId;
    });

    userApp.get('/manifest.json', async (request, reply) => {
      const { userSlug } = request.params as { userSlug: string };
      const manifest = await buildManifest(userSlug);
      return reply.header('Cache-Control', CACHE_MANIFEST).send(manifest);
    });

    userApp.get('/catalog/:type/:id.json', async (request, reply) => {
      const { type, id } = request.params as { type: string; id: string };
      const userId = (request as RequestWithUser).libraryUserId!;
      const metas = await resolveCatalog(type, id, {}, userId);
      return reply.header('Cache-Control', CACHE_CATALOG).send({ metas });
    });

    userApp.get('/catalog/:type/:id/:extra.json', async (request, reply) => {
      const { type, id, extra } = request.params as {
        type: string;
        id: string;
        extra: string;
      };
      const userId = (request as RequestWithUser).libraryUserId!;
      const metas = await resolveCatalog(
        type,
        id,
        parseCatalogExtra(extra),
        userId,
      );
      return reply.header('Cache-Control', CACHE_CATALOG).send({ metas });
    });

    userApp.get('/meta/:type/:id.json', async (request, reply) => {
      const { type, id } = request.params as { type: string; id: string };
      const userId = (request as RequestWithUser).libraryUserId!;
      const meta = await resolveMeta(type, id, userId);
      if (!meta) {
        throw new NotFoundError('Unsupported meta type');
      }
      return reply.header('Cache-Control', CACHE_META).send({ meta });
    });

    userApp.get('/stream/:type/:videoId.json', async (request, reply) => {
      const { userSlug, type, videoId } = request.params as {
        userSlug: string;
        type: string;
        videoId: string;
      };

      if (type !== 'series' && type !== 'movie') {
        throw new NotFoundError('Unsupported stream type');
      }
      if (!videoId.startsWith('putio:')) {
        throw new NotFoundError('Unsupported video id');
      }

      const userId = (request as RequestWithUser).libraryUserId!;
      const secret = requireSecretKey();
      const file = await resolveVideoToPutioFile(videoId, userId);
      const streams = await buildStremioStreams(
        file,
        streamBaseUrl(request, `/u/${userSlug}`),
        secret,
        typeof request.headers['user-agent'] === 'string'
          ? request.headers['user-agent']
          : undefined,
      );

      return reply.header('Cache-Control', CACHE_STREAM).send({ streams });
    });
  }, { prefix: '/u/:userSlug' });
}
