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

function resolveProto(
  host: string,
  request: {
    headers: Record<string, string | string[] | undefined>;
    protocol?: string;
  },
): string {
  const forwardedProto = headerValue(request.headers['x-forwarded-proto']);
  if (forwardedProto) {
    return forwardedProto;
  }

  const hostname = host.split(':')[0]?.toLowerCase() ?? '';
  if (hostname.endsWith('.trycloudflare.com')) {
    return 'https';
  }

  return request.protocol ?? 'http';
}

export interface ResolveRequestBaseUrlOptions {
  publicBaseUrl?: string;
}

export function resolveRequestBaseUrl(
  request: {
    headers: Record<string, string | string[] | undefined>;
    protocol?: string;
  },
  fallbackBaseUrl: string,
  options: ResolveRequestBaseUrlOptions = {},
): string {
  const forwardedHost = headerValue(request.headers['x-forwarded-host']);
  const host = forwardedHost ?? headerValue(request.headers.host);

  if (host && !isLoopbackHost(host)) {
    const proto = resolveProto(host, request);
    return normalizeBaseUrl(`${proto}://${host}`);
  }

  const publicBaseUrl = options.publicBaseUrl?.trim();
  if (publicBaseUrl) {
    return normalizeBaseUrl(publicBaseUrl);
  }

  return normalizeBaseUrl(fallbackBaseUrl);
}
