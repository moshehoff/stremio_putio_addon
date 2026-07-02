import { getFolderCatalogDefinitions } from '@putio-stremio/db';
import { buildManifestWithCatalogs, type Manifest } from './manifest.js';

export async function buildManifest(): Promise<Manifest> {
  const folders = await getFolderCatalogDefinitions();
  return buildManifestWithCatalogs(folders);
}
