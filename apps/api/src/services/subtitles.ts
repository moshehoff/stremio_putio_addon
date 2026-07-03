import {
  getPutioSubtitlesForVideo,
  type StremioSubtitleEntry,
} from '@putio-stremio/db';

export type { StremioSubtitleEntry };

export async function buildStremioSubtitles(
  videoId: string,
  userId: string,
  baseUrl: string,
  secret: string,
): Promise<StremioSubtitleEntry[]> {
  return getPutioSubtitlesForVideo(videoId, userId, baseUrl, secret);
}
