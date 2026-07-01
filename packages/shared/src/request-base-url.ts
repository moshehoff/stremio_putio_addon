export function normalizeBaseUrl(url: string): string {
  return url.replace('://localhost', '://127.0.0.1').replace(/\/$/, '');
}

function headerValue(
  value: string | string[] | undefined,
): string | undefined {
  if (Array.isArray(value)) {
    return value[0];
  }
  return value;
}

function isLoopbackHost(host: string): boolean {
  const hostname = host.split(':')[0]?.toLowerCase() ?? '';
  return (
    hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    hostname === '[::1]' ||
    hostname === '::1'
  );
}

export function resolveRequestBaseUrl(
  request: {
    headers: Record<string, string | string[] | undefined>;
    protocol?: string;
  },
  fallbackBaseUrl: string,
): string {
  const forwardedHost = headerValue(request.headers['x-forwarded-host']);
  const host = forwardedHost ?? headerValue(request.headers.host);

  if (host && !isLoopbackHost(host)) {
    const forwardedProto = headerValue(request.headers['x-forwarded-proto']);
    const proto = forwardedProto ?? request.protocol ?? 'http';
    return normalizeBaseUrl(`${proto}://${host}`);
  }

  return normalizeBaseUrl(fallbackBaseUrl);
}
