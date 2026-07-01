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

export function buildManifest(): Manifest {
  return {
    id: 'com.putio.library',
    version: '0.4.0',
    name: 'Put.io Library',
    description:
      'Stream your Put.io cloud library in Stremio — series and movies.',
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
    catalogs: [
      {
        type: 'series',
        id: 'putio_series',
        name: 'Put.io Series',
        extra: [
          { name: 'search', isRequired: false },
          { name: 'skip', isRequired: false },
        ],
      },
      {
        type: 'movie',
        id: 'putio_movies',
        name: 'Put.io Movies',
        extra: [
          { name: 'search', isRequired: false },
          { name: 'skip', isRequired: false },
        ],
      },
    ],
    idPrefixes: ['putio:'],
    behaviorHints: {
      configurable: true,
      configurationRequired: false,
    },
  };
}
