import type { FastifyInstance } from 'fastify';
import { buildManifest } from '../manifest.js';

export async function registerManifestRoutes(app: FastifyInstance) {
  app.get('/manifest.json', async (_request, reply) => {
    const manifest = buildManifest();
    return reply
      .header('Cache-Control', 'public, max-age=3600')
      .send(manifest);
  });
}
