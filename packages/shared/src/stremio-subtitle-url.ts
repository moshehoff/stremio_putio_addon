const STREMIO_DESKTOP_SUBTITLE_PROXY = 'http://127.0.0.1:11470/subtitles.vtt?from=';

function isLoopbackHostname(hostname: string): boolean {
  const normalized = hostname.toLowerCase();
  return (
    normalized === 'localhost' ||
    normalized === '127.0.0.1' ||
    normalized === '[::1]' ||
    normalized === '::1'
  );
}

/** Route subtitle files through Stremio desktop's local server (encoding + same-origin). */
export function wrapStremioSubtitleUrl(
  subtitleUrl: string,
  addonBaseUrl: string,
): string {
  try {
    if (!isLoopbackHostname(new URL(addonBaseUrl).hostname)) {
      return subtitleUrl;
    }
  } catch {
    return subtitleUrl;
  }

  return `${STREMIO_DESKTOP_SUBTITLE_PROXY}${encodeURIComponent(subtitleUrl)}`;
}
