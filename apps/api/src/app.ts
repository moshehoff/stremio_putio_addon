import Fastify from 'fastify';
import cors from '@fastify/cors';
import {
  AppError,
  buildLanBaseUrl,
  createLogger,
  getEnv,
  normalizeBaseUrl,
} from '@putio-stremio/shared';
import { registerHealthRoutes } from './routes/health.js';
import { registerManifestRoutes } from './routes/manifest.js';
import { registerCatalogRoutes, registerMetaRoutes } from './routes/stremio.js';
import { registerStreamRoutes } from './routes/stream.js';
import { registerProxyRoutes } from './routes/proxy.js';

export async function buildApp() {
  const env = getEnv();
  const log = createLogger('api');

  const app = Fastify({
    logger: false,
  });

  await app.register(cors, {
    origin: true,
    methods: ['GET', 'HEAD', 'OPTIONS'],
  });

  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof AppError) {
      log.warn({ err: error, code: error.code }, error.message);
      return reply.status(error.statusCode).send({
        error: error.code,
        message: error.message,
      });
    }

    log.error({ err: error }, 'Unhandled error');
    return reply.status(500).send({
      error: 'INTERNAL_ERROR',
      message: 'Internal server error',
    });
  });

  await registerHealthRoutes(app);
  await registerManifestRoutes(app);
  await registerCatalogRoutes(app);
  await registerMetaRoutes(app);
  await registerStreamRoutes(app);
  await registerProxyRoutes(app);

  app.addHook('onListen', () => {
    const desktopUrl = `${normalizeBaseUrl(env.BASE_URL)}/manifest.json`;
    const androidUrl = buildLanBaseUrl(env.PORT);

    log.info(
      {
        port: env.PORT,
        baseUrl: env.BASE_URL,
        desktopInstallUrl: desktopUrl,
        androidInstallUrl: androidUrl
          ? `${androidUrl}/manifest.json`
          : undefined,
      },
      'API listening',
    );
  });

  return app;
}
