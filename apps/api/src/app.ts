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
import {
  registerDefaultAddonRoutes,
  registerPerUserAddonRoutes,
} from './routes/addon.js';
import { registerProxyRoutes } from './routes/proxy.js';
import { registerConfigureRoutes } from './routes/configure.js';
import { startAutoScan } from './services/auto-scan.js';

export async function buildApp() {
  const env = getEnv();
  const log = createLogger('api');

  const app = Fastify({
    logger: false,
  });

  await app.register(cors, {
    origin: true,
    methods: ['GET', 'HEAD', 'OPTIONS', 'POST'],
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
  await registerDefaultAddonRoutes(app);
  await registerPerUserAddonRoutes(app);
  await registerProxyRoutes(app);
  await registerConfigureRoutes(app);

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

    startAutoScan();
  });

  return app;
}
