import { getEnv } from '@putio-stremio/shared';
import { buildApp } from './app.js';
async function main() {
  const env = getEnv();
  const app = await buildApp();
  await app.listen({ port: env.PORT, host: '0.0.0.0' });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
