import { describe, expect, it } from 'vitest';
import { buildManifest, manifestSchema } from '../src/manifest.js';

describe('manifest', () => {
  it('builds a valid Stremio manifest', () => {
    const manifest = buildManifest();
    const result = manifestSchema.safeParse(manifest);
    expect(result.success).toBe(true);
  });

  it('declares series-first catalogs', () => {
    const manifest = buildManifest();
    expect(manifest.catalogs[0]?.id).toBe('putio_series');
    expect(manifest.catalogs[0]?.type).toBe('series');
  });

  it('uses putio: id prefix for meta and stream', () => {
    const manifest = buildManifest();
    expect(manifest.idPrefixes).toContain('putio:');

    const metaResource = manifest.resources.find(
      (r) => typeof r === 'object' && r.name === 'meta',
    );
    expect(metaResource).toMatchObject({
      name: 'meta',
      idPrefixes: ['putio:'],
    });

    const hasSubtitles = manifest.resources.some(
      (r) => typeof r === 'object' && r.name === 'subtitles',
    );
    expect(hasSubtitles).toBe(false);
  });
});
