import { getFolderCatalogDefinitions, hasPutioAccessToken } from '@putio-stremio/db';
import { buildManifestWithCatalogs, type Manifest } from './manifest.js';

export async function buildManifest(): Promise<Manifest> {
  const [folders, connected] = await Promise.all([
    getFolderCatalogDefinitions(),
    hasPutioAccessToken(),
  ]);
  return buildManifestWithCatalogs(folders, {
    configurationRequired: !connected,
  });
}
