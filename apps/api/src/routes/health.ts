import type { FastifyInstance } from 'fastify';

export async function registerHealthRoutes(app: FastifyInstance) {
  app.get('/health', async () => ({
    status: 'ok',
    timestamp: new Date().toISOString(),
  }));

  app.get('/ready', async () => ({
    status: 'ready',
    timestamp: new Date().toISOString(),
  }));
}
