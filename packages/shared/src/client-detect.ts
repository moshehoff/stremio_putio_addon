export function isWebOsUserAgent(userAgent: string | undefined): boolean {
  if (!userAgent) {
    return false;
  }
  return /web0s|webos|smarttv|lge/i.test(userAgent);
}
