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

const MAX_BODY_LOG_CHARS = 4000;

function formatResponseBody(payload: unknown): string | undefined {
  if (payload === undefined || payload === null) {
    return undefined;
  }

  let text: string;
  if (typeof payload === 'string') {
    text = payload;
    try {
      text = JSON.stringify(JSON.parse(text), null, 2);
    } catch {
      // keep raw text (html, plain, etc.)
    }
  } else if (Buffer.isBuffer(payload)) {
    text = payload.toString('utf8');
  } else if (typeof payload === 'object') {
    text = JSON.stringify(payload, null, 2);
  } else {
    return String(payload);
  }

  if (text.length > MAX_BODY_LOG_CHARS) {
    return `${text.slice(0, MAX_BODY_LOG_CHARS)}\n… (${text.length} chars total)`;
  }
  return text;
}

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

  app.addHook('onRequest', async (request) => {
    if (request.method === 'OPTIONS') {
      return;
    }
    console.log(
      `\n← ${request.method} ${request.url}`,
      `\n  host: ${request.headers.host ?? '-'}`,
      `\n  ua:   ${typeof request.headers['user-agent'] === 'string' ? request.headers['user-agent'] : '-'}`,
    );
  });

  app.addHook('onSend', async (request, reply, payload) => {
    if (request.method === 'OPTIONS') {
      return payload;
    }

    const status = reply.statusCode;
    const path = request.url.split('?')[0] ?? request.url;
    const isProxy =
      path.startsWith('/v1/proxy/') || path.startsWith('/v1/subtitles/');

    if (isProxy) {
      const bytes =
        typeof payload === 'string'
          ? Buffer.byteLength(payload)
          : Buffer.isBuffer(payload)
            ? payload.length
            : undefined;
      console.log(
        `→ ${status} ${request.method} ${request.url}`,
        bytes !== undefined ? `(${bytes} bytes)` : '(stream)',
      );
      return payload;
    }

    const body = formatResponseBody(payload);
    console.log(`→ ${status} ${request.method} ${request.url}`);
    if (body !== undefined) {
      console.log(body);
    }
    return payload;
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
