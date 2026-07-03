import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
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
import { buildStremioSubtitles } from '../services/subtitles.js';
import { buildManifest } from '../manifest-builder.js';

const CACHE_CATALOG = 'public, max-age=300';
const CACHE_META = 'public, max-age=86400';
const CACHE_STREAM = 'public, max-age=300';
const CACHE_SUBTITLES = 'public, max-age=86400';
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
    `${resolveRequestBaseUrl(request, env.BASE_URL, {
      publicBaseUrl: env.PUBLIC_BASE_URL,
    })}${pathPrefix}`,
  );
}

async function buildStreams(
  request: FastifyRequest,
  videoId: string,
  userId: string,
  pathPrefix = '',
) {
  const secret = requireSecretKey();
  const file = await resolveVideoToPutioFile(videoId, userId);
  return buildStremioStreams(
    file,
    streamBaseUrl(request, pathPrefix),
    secret,
    typeof request.headers['user-agent'] === 'string'
      ? request.headers['user-agent']
      : undefined,
    userId,
  );
}

async function buildSubtitles(
  request: FastifyRequest,
  videoId: string,
  userId: string,
  pathPrefix = '',
) {
  const secret = requireSecretKey();
  return buildStremioSubtitles(
    decodeURIComponent(videoId),
    userId,
    streamBaseUrl(request, pathPrefix),
    secret,
  );
}

async function handleSubtitlesRequest(
  request: FastifyRequest,
  reply: FastifyReply,
  options: {
    type: string;
    videoId: string;
    userId: string | undefined;
    pathPrefix?: string;
  },
) {
  const { type, videoId, userId, pathPrefix = '' } = options;
  const id = decodeURIComponent(videoId);

  if (type !== 'series' && type !== 'movie') {
    throw new NotFoundError('Unsupported subtitles type');
  }
  if (!id.startsWith('putio:')) {
    throw new NotFoundError('Unsupported video id');
  }

  if (!userId) {
    return reply.header('Cache-Control', CACHE_SUBTITLES).send({ subtitles: [] });
  }

  const subtitles = await buildSubtitles(request, id, userId, pathPrefix);
  return reply.header('Cache-Control', CACHE_SUBTITLES).send({ subtitles });
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

    const streams = await buildStreams(request, videoId, userId);
    return reply.header('Cache-Control', CACHE_STREAM).send({ streams });
  });

  const defaultSubtitles = async (
    request: FastifyRequest,
    reply: FastifyReply,
  ) => {
    const { type, videoId } = request.params as {
      type: string;
      videoId: string;
    };
    return handleSubtitlesRequest(request, reply, {
      type,
      videoId,
      userId: await resolveLibraryUserId(),
    });
  };

  // Stremio desktop sends extras: /subtitles/movie/{id}/filename=…&videoSize=….json
  app.get('/subtitles/:type/:videoId.json', defaultSubtitles);
  app.get('/subtitles/:type/:videoId/:extra.json', defaultSubtitles);
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
      const streams = await buildStreams(
        request,
        videoId,
        userId,
        `/u/${userSlug}`,
      );

      return reply.header('Cache-Control', CACHE_STREAM).send({ streams });
    });

    const perUserSubtitles = async (
      request: FastifyRequest,
      reply: FastifyReply,
    ) => {
      const { userSlug, type, videoId } = request.params as {
        userSlug: string;
        type: string;
        videoId: string;
      };
      return handleSubtitlesRequest(request, reply, {
        type,
        videoId,
        userId: (request as RequestWithUser).libraryUserId,
        pathPrefix: `/u/${userSlug}`,
      });
    };

    userApp.get('/subtitles/:type/:videoId.json', perUserSubtitles);
    userApp.get('/subtitles/:type/:videoId/:extra.json', perUserSubtitles);
  }, { prefix: '/u/:userSlug' });
}
