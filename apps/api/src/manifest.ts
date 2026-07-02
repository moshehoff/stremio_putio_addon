import { z } from 'zod';

const catalogExtraSchema = z.object({
  name: z.string(),
  isRequired: z.boolean().optional(),
  options: z.array(z.string()).optional(),
  optionsLimit: z.number().optional(),
});

const catalogSchema = z.object({
  type: z.enum(['movie', 'series', 'channel', 'tv']),
  id: z.string().min(1),
  name: z.string().min(1),
  extra: z.array(catalogExtraSchema).optional(),
});

const resourceSchema = z.union([
  z.enum(['catalog', 'meta', 'stream', 'subtitles', 'addon_catalog']),
  z.object({
    name: z.enum(['catalog', 'meta', 'stream', 'subtitles', 'addon_catalog']),
    types: z.array(z.string()).optional(),
    idPrefixes: z.array(z.string()).optional(),
  }),
]);

export const manifestSchema = z.object({
  id: z.string().min(1),
  version: z.string().min(1),
  name: z.string().min(1),
  description: z.string().min(1),
  resources: z.array(resourceSchema).min(1),
  types: z.array(z.enum(['movie', 'series', 'channel', 'tv'])).min(1),
  catalogs: z.array(catalogSchema),
  idPrefixes: z.array(z.string()).optional(),
  behaviorHints: z
    .object({
      configurable: z.boolean().optional(),
      configurationRequired: z.boolean().optional(),
    })
    .optional(),
});

export type Manifest = z.infer<typeof manifestSchema>;
export type ManifestCatalog = z.infer<typeof catalogSchema>;

const CATALOG_EXTRA = [
  { name: 'search', isRequired: false },
  { name: 'skip', isRequired: false },
] as const;

export function folderCatalogDisplayName(folderName: string): string {
  return `Put.io ${folderName}`;
}

export function buildManifestBase(): Omit<Manifest, 'catalogs'> {
  return {
    id: 'com.putio.library',
    version: '0.9.0',
    name: 'Put.io Library',
    description:
      'Stream your Put.io cloud library in Stremio — one catalog per top-level folder.',
    resources: [
      'catalog',
      {
        name: 'meta',
        types: ['movie', 'series'],
        idPrefixes: ['putio:'],
      },
      {
        name: 'stream',
        types: ['movie', 'series'],
        idPrefixes: ['putio:'],
      },
    ],
    types: ['movie', 'series'],
    idPrefixes: ['putio:'],
    behaviorHints: {
      configurable: true,
      configurationRequired: false,
    },
  };
}

export function buildManifestWithCatalogs(
  folders: Array<{ catalogId: string; name: string }>,
  options: { configurationRequired?: boolean } = {},
): Manifest {
  const base = buildManifestBase();
  return {
    ...base,
    behaviorHints: {
      ...base.behaviorHints,
      configurationRequired: options.configurationRequired ?? base.behaviorHints?.configurationRequired,
    },
    catalogs: folders.map((folder) => ({
      type: 'series' as const,
      id: folder.catalogId,
      name: folderCatalogDisplayName(folder.name),
      extra: [...CATALOG_EXTRA],
    })),
  };
}
