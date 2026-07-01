import type { FastifyInstance } from 'fastify';
import { NotFoundError } from '@putio-stremio/shared';
import {
  getMovieMeta,
  getMoviesCatalog,
  getSeriesCatalog,
  getSeriesMeta,
  parseCatalogExtra,
} from '@putio-stremio/db';

const CACHE_CATALOG = 'public, max-age=600';
const CACHE_META = 'public, max-age=86400';

export async function registerCatalogRoutes(app: FastifyInstance) {
  app.get('/catalog/:type/:id.json', async (request, reply) => {
    const { type, id } = request.params as { type: string; id: string };
    const metas = await resolveCatalog(type, id, {});
    return reply.header('Cache-Control', CACHE_CATALOG).send({ metas });
  });

  app.get('/catalog/:type/:id/:extra.json', async (request, reply) => {
    const { type, id, extra } = request.params as {
      type: string;
      id: string;
      extra: string;
    };
    const metas = await resolveCatalog(type, id, parseCatalogExtra(extra));
    return reply.header('Cache-Control', CACHE_CATALOG).send({ metas });
  });
}

export async function registerMetaRoutes(app: FastifyInstance) {
  app.get('/meta/:type/:id.json', async (request, reply) => {
    const { type, id } = request.params as { type: string; id: string };

    const meta =
      type === 'series'
        ? await getSeriesMeta(id)
        : type === 'movie'
          ? await getMovieMeta(id)
          : null;

    if (!meta) {
      throw new NotFoundError('Unsupported meta type');
    }

    return reply.header('Cache-Control', CACHE_META).send({ meta });
  });
}

async function resolveCatalog(
  type: string,
  id: string,
  extra: ReturnType<typeof parseCatalogExtra>,
) {
  if (type === 'series' && id === 'putio_series') {
    return getSeriesCatalog(extra);
  }

  if (type === 'movie' && id === 'putio_movies') {
    return getMoviesCatalog(extra);
  }

  return [];
}
