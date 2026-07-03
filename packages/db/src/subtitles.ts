import { createPutioProvider } from '@putio-stremio/putio-client';
import { buildSubtitleProxyUrl, wrapStremioSubtitleUrl } from '@putio-stremio/shared';
import { prisma } from './client.js';
import { requirePutioAccessToken } from './putio-token.js';
import type { ResolvedPutioFile } from './stream.js';
import { resolveVideoToPutioFile } from './stream.js';

export interface StremioSubtitleEntry {
  id: string;
  url: string;
  lang: string;
  name?: string;
}

const LANGUAGE_ALIASES: Record<string, string> = {
  en: 'en',
  eng: 'en',
  english: 'en',
  he: 'he',
  heb: 'he',
  hebrew: 'he',
  iw: 'he',
  ar: 'ar',
  arabic: 'ar',
  es: 'es',
  spanish: 'es',
  fr: 'fr',
  french: 'fr',
  de: 'de',
  german: 'de',
  it: 'it',
  italian: 'it',
  ru: 'ru',
  russian: 'ru',
  pt: 'pt',
  portuguese: 'pt',
  ja: 'ja',
  japanese: 'ja',
};

export function mapPutioLanguageToStremio(language: string): string {
  const normalized = language.trim().toLowerCase();
  if (LANGUAGE_ALIASES[normalized]) {
    return LANGUAGE_ALIASES[normalized]!;
  }

  const alpha2 = normalized.slice(0, 2);
  if (/^[a-z]{2}$/.test(alpha2)) {
    return alpha2;
  }

  return normalized.replace(/[^a-z]/g, '').slice(0, 2) || 'und';
}

function subtitleMatchTokens(fileName: string, mediaTitle?: string): string[] {
  const tokens = new Set<string>();
  const sources = [fileName, mediaTitle ?? ''];
  for (const source of sources) {
    for (const word of source.toLowerCase().split(/[^a-z0-9]+/)) {
      if (word.length >= 4) {
        tokens.add(word);
      }
    }
  }
  return [...tokens];
}

/** Drop unrelated OpenSubtitles noise when Put.io returns subs for other FLHD releases. */
export function filterRelevantPutioSubtitles(
  subtitles: Array<{ key: string; language: string; name: string; source: string }>,
  fileName: string,
  mediaTitle?: string,
): Array<{ key: string; language: string; name: string; source: string }> {
  const tokens = subtitleMatchTokens(fileName, mediaTitle);
  if (tokens.length === 0) {
    return subtitles;
  }

  const relevant = subtitles.filter((subtitle) => {
    const haystack = subtitle.name.toLowerCase();
    return tokens.some((token) => haystack.includes(token));
  });

  return relevant.length > 0 ? relevant : subtitles;
}

export async function getPutioSubtitlesForFile(
  putioFileId: number,
  userId: string | undefined,
  baseUrl: string,
  secret: string,
  options: { fileName?: string; mediaTitle?: string } = {},
): Promise<StremioSubtitleEntry[]> {
  const putio = createPutioProvider(await requirePutioAccessToken(userId));
  const subtitles = await putio.listSubtitles(putioFileId);
  const filtered = filterRelevantPutioSubtitles(
    subtitles,
    options.fileName ?? '',
    options.mediaTitle,
  );

  return filtered.map((subtitle) => {
    const lang = mapPutioLanguageToStremio(subtitle.language);
    const proxyUrl = buildSubtitleProxyUrl(baseUrl, putioFileId, subtitle.key, secret);
    return {
      id: `${lang}:${subtitle.key}`,
      lang,
      name: subtitle.name || undefined,
      url: wrapStremioSubtitleUrl(proxyUrl, baseUrl),
    };
  });
}

export async function getPutioSubtitlesForResolvedFile(
  file: ResolvedPutioFile,
  userId: string,
  baseUrl: string,
  secret: string,
): Promise<StremioSubtitleEntry[]> {
  const media = await prisma.media.findFirst({
    where: {
      userId,
      files: { some: { putioFileId: file.putioFileId } },
    },
    select: { title: true },
  });

  return getPutioSubtitlesForFile(file.putioFileId, userId, baseUrl, secret, {
    fileName: file.name,
    mediaTitle: media?.title,
  });
}

export async function getPutioSubtitlesForVideo(
  videoId: string,
  userId: string,
  baseUrl: string,
  secret: string,
): Promise<StremioSubtitleEntry[]> {
  const file = await resolveVideoToPutioFile(videoId, userId);
  const media = await prisma.media.findFirst({
    where: { userId, stremioId: videoId },
    select: { title: true },
  });
  return getPutioSubtitlesForFile(file.putioFileId, userId, baseUrl, secret, {
    fileName: file.name,
    mediaTitle: media?.title,
  });
}
