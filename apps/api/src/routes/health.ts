import type { FastifyInstance } from 'fastify';
import {
  buildLanBaseUrl,
  getEnv,
  getLocalLanIpv4Addresses,
  normalizeBaseUrl,
} from '@putio-stremio/shared';

export async function registerHealthRoutes(app: FastifyInstance) {
  app.get('/health', async () => {
    const env = getEnv();
    const lanAddresses = getLocalLanIpv4Addresses();
    const lanBaseUrl = buildLanBaseUrl(env.PORT);
    const desktopBaseUrl = normalizeBaseUrl(env.BASE_URL);

    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      install: {
        desktop: `${desktopBaseUrl}/manifest.json`,
        android: lanBaseUrl
          ? `${lanBaseUrl}/manifest.json`
          : undefined,
        public: env.PUBLIC_BASE_URL
          ? `${normalizeBaseUrl(env.PUBLIC_BASE_URL)}/manifest.json`
          : undefined,
      },
      lan: {
        addresses: lanAddresses,
        baseUrl: lanBaseUrl,
      },
    };
  });

  app.get('/ready', async () => ({
    status: 'ready',
    timestamp: new Date().toISOString(),
  }));
}
