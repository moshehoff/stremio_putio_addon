import { createPutioProvider } from '@putio-stremio/putio-client';
import {
  buildSubtitleProxyUrl,
  isEnglishSubtitle,
  mapPutioLanguageToStremio,
  requirePutioToken,
} from '@putio-stremio/shared';

export interface StremioStreamSubtitle {
  id: string;
  lang: string;
  url: string;
}

export async function fetchEnglishSubtitlesForFile(
  putioFileId: number,
  baseUrl: string,
  secret: string,
): Promise<StremioStreamSubtitle[]> {
  const putio = createPutioProvider(requirePutioToken());

  let subtitles;
  try {
    subtitles = await putio.listSubtitles(putioFileId);
  } catch {
    return [];
  }

  const english = subtitles.filter((sub) => isEnglishSubtitle(sub.language));
  const results: StremioStreamSubtitle[] = [];

  for (const sub of english) {
    const lang = mapPutioLanguageToStremio(sub.language) ?? 'eng';
    results.push({
      id: sub.key,
      lang,
      url: buildSubtitleProxyUrl(
        baseUrl,
        putioFileId,
        sub.key,
        lang,
        secret,
      ),
    });
  }

  return results;
}
