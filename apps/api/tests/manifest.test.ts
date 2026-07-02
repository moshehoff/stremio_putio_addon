import { describe, expect, it } from 'vitest';
import {
  buildManifestBase,
  buildManifestWithCatalogs,
  manifestSchema,
} from '../src/manifest.js';

describe('manifest', () => {
  it('builds a valid Stremio manifest', () => {
    const manifest = buildManifestWithCatalogs([
      { catalogId: 'putio_folder_123', name: 'Idan' },
    ]);
    const result = manifestSchema.safeParse(manifest);
    expect(result.success).toBe(true);
  });

  it('creates one catalog per Put.io folder', () => {
    const manifest = buildManifestWithCatalogs([
      { catalogId: 'putio_folder_1', name: 'Idan' },
      { catalogId: 'putio_folder_2', name: 'TV Shows' },
    ]);
    expect(manifest.catalogs).toHaveLength(2);
    expect(manifest.catalogs[0]).toMatchObject({
      id: 'putio_folder_1',
      type: 'series',
      name: 'Put.io Idan',
    });
    expect(manifest.catalogs[1]?.name).toBe('Put.io TV Shows');
  });

  it('uses putio: id prefix for meta and stream', () => {
    const manifest = buildManifestBase();
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

  it('does not declare global series or unsorted catalogs', () => {
    const manifest = buildManifestWithCatalogs([]);
    expect(manifest.catalogs.find((c) => c.id === 'putio_series')).toBeUndefined();
    expect(manifest.catalogs.find((c) => c.id === 'putio_unsorted')).toBeUndefined();
    expect(manifest.catalogs.find((c) => c.id === 'putio_movies')).toBeUndefined();
  });
});
