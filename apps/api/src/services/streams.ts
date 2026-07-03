import { createPutioProvider } from '@putio-stremio/putio-client';
import type { ResolvedPutioFile } from '@putio-stremio/db';
import {
  getPutioSubtitlesForResolvedFile,
  requirePutioAccessToken,
} from '@putio-stremio/db';
import {
  buildMp4ProxyUrl,
  buildProxyUrl,
  isWebOsUserAgent,
} from '@putio-stremio/shared';

export interface StremioStreamEntry {
  name: string;
  title?: string;
  url: string;
  subtitles?: Array<{
    id: string;
    url: string;
    lang: string;
    name?: string;
  }>;
  behaviorHints?: {
    notWebReady?: boolean;
    bingeGroup?: string;
    filename?: string;
    videoSize?: number;
  };
}

async function attachSubtitles(
  stream: StremioStreamEntry,
  file: ResolvedPutioFile,
  userId: string,
  baseUrl: string,
  secret: string,
): Promise<StremioStreamEntry> {
  try {
    const subtitles = await getPutioSubtitlesForResolvedFile(
      file,
      userId,
      baseUrl,
      secret,
    );
    if (subtitles.length === 0) {
      return stream;
    }
    return { ...stream, subtitles };
  } catch {
    return stream;
  }
}

export async function buildStremioStreams(
  file: ResolvedPutioFile,
  baseUrl: string,
  secret: string,
  userAgent: string | undefined,
  userId: string,
): Promise<StremioStreamEntry[]> {
  const preferTv = isWebOsUserAgent(userAgent);
  const videoSize = Number(file.size);
  const hints = {
    filename: file.name,
    videoSize,
    bingeGroup: 'putio',
  };

  const originalStream = await attachSubtitles(
    {
      name: 'Put.io',
      title: file.name,
      url: buildProxyUrl(baseUrl, file.putioFileId, secret),
      behaviorHints: {
        ...hints,
        notWebReady: file.notWebReady,
      },
    },
    file,
    userId,
    baseUrl,
    secret,
  );

  if (!file.notWebReady) {
    return [originalStream];
  }

  const putio = createPutioProvider(await requirePutioAccessToken(userId));
  const mp4 = await putio.getMp4PlaybackInfo(file.putioFileId, file.parentId);

  if (!mp4.available) {
    return [originalStream];
  }

  const mp4Stream = await attachSubtitles(
    {
      name: 'Put.io MP4',
      title: `${file.name} (TV / webOS)`,
      url: buildMp4ProxyUrl(baseUrl, file.putioFileId, file.parentId, secret),
      behaviorHints: {
        filename: file.name.replace(/\.[^.]+$/, '.mp4'),
        videoSize: mp4.mp4Size ?? videoSize,
        bingeGroup: 'putio',
        notWebReady: false,
      },
    },
    file,
    userId,
    baseUrl,
    secret,
  );

  const labeledOriginal: StremioStreamEntry = {
    ...originalStream,
    name: 'Put.io Original',
    title: `${file.name} (MKV)`,
  };

  return preferTv
    ? [mp4Stream, labeledOriginal]
    : [labeledOriginal, mp4Stream];
}
