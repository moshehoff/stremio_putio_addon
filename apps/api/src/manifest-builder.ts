import {
  getFolderCatalogDefinitions,
  getDefaultUser,
  getUserBySlug,
  hasPutioAccessToken,
} from '@putio-stremio/db';
import { buildManifestWithCatalogs, type Manifest } from './manifest.js';

export async function buildManifest(userSlug?: string): Promise<Manifest> {
  const user = userSlug ? await getUserBySlug(userSlug) : await getDefaultUser();
  const [folders, connected] = await Promise.all([
    user ? getFolderCatalogDefinitions(user.id) : Promise.resolve([]),
    user ? hasPutioAccessToken(user.id) : hasPutioAccessToken(),
  ]);

  const manifest = buildManifestWithCatalogs(folders, {
    configurationRequired: !connected,
  });

  if (userSlug) {
    return {
      ...manifest,
      id: `com.putio.library.${userSlug}`,
      name: `Put.io Library (${userSlug})`,
    };
  }

  return manifest;
}
