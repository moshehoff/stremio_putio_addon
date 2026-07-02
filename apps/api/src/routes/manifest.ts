import type { FastifyInstance } from 'fastify';
import { buildManifest } from '../manifest-builder.js';

export async function registerManifestRoutes(app: FastifyInstance) {
  app.get('/manifest.json', async (_request, reply) => {
    const manifest = await buildManifest();
    return reply
      .header('Cache-Control', 'public, max-age=300')
      .send(manifest);
  });
}
