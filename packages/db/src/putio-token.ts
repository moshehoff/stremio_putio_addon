import {
  decryptSecret,
  encryptSecret,
  getEnv,
  requireSecretKey,
  ValidationError,
} from '@putio-stremio/shared';
import { createPutioProvider } from '@putio-stremio/putio-client';
import { prisma } from './client.js';
import { getDefaultUser, getUserBySlug } from './parse.js';

const REFRESH_BUFFER_MS = 5 * 60 * 1000;

interface OAuthTokenResponse {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
}

export async function getPutioAccessToken(userId?: string): Promise<string | null> {
  const user = userId
    ? await prisma.user.findUnique({ where: { id: userId } })
    : await getDefaultUser();

  if (user) {
    const stored = await prisma.oAuthToken.findUnique({
      where: { userId: user.id },
    });
    if (stored) {
      if (shouldRefreshToken(stored.expiresAt)) {
        if (stored.refreshToken) {
          try {
            return await refreshPutioAccessToken(user.id, stored.refreshToken);
          } catch {
            // Fall through to stored access token if refresh fails.
          }
        }
      }

      return decryptSecret(stored.accessToken, requireSecretKey());
    }
  }

  if (!userId) {
    return getEnv().PUTIO_TOKEN ?? null;
  }

  return null;
}

export async function getPutioAccessTokenForSlug(slug: string): Promise<string | null> {
  const user = await getUserBySlug(slug);
  if (!user) {
    return null;
  }
  return getPutioAccessToken(user.id);
}

export async function hasPutioAccessToken(userId?: string): Promise<boolean> {
  return (await getPutioAccessToken(userId)) !== null;
}

export async function requirePutioAccessToken(userId?: string): Promise<string> {
  const token = await getPutioAccessToken(userId);
  if (!token) {
    throw new ValidationError(
      'Put.io is not connected. Open /configure to add your OAuth token.',
    );
  }
  return token;
}

function shouldRefreshToken(expiresAt: Date | null): boolean {
  if (!expiresAt) {
    return false;
  }
  return expiresAt.getTime() - Date.now() <= REFRESH_BUFFER_MS;
}

export async function savePutioAccessToken(
  accessToken: string,
  options: {
    userId?: string;
    refreshToken?: string | null;
    expiresInSeconds?: number | null;
  } = {},
): Promise<{ userId: string; slug: string }> {
  const trimmed = accessToken.trim();
  if (!trimmed) {
    throw new ValidationError('Put.io token is required');
  }

  const putio = createPutioProvider(trimmed);
  const account = await putio.getAccountInfo();

  const user = options.userId
    ? await prisma.user.update({
        where: { id: options.userId },
        data: {
          putioUserId: account.userId,
          putioUsername: account.username,
        },
      })
    : await prisma.user.upsert({
        where: { slug: 'default' },
        create: {
          slug: 'default',
          putioUserId: account.userId,
          putioUsername: account.username,
        },
        update: {
          putioUserId: account.userId,
          putioUsername: account.username,
        },
      });

  const encryptedAccess = encryptSecret(trimmed, requireSecretKey());
  const encryptedRefresh = options.refreshToken
    ? encryptSecret(options.refreshToken, requireSecretKey())
    : null;
  const expiresAt =
    options.expiresInSeconds && options.expiresInSeconds > 0
      ? new Date(Date.now() + options.expiresInSeconds * 1000)
      : null;

  await prisma.oAuthToken.upsert({
    where: { userId: user.id },
    create: {
      userId: user.id,
      accessToken: encryptedAccess,
      refreshToken: encryptedRefresh,
      expiresAt,
    },
    update: {
      accessToken: encryptedAccess,
      ...(options.refreshToken !== undefined
        ? { refreshToken: encryptedRefresh }
        : {}),
      ...(options.expiresInSeconds !== undefined ? { expiresAt } : {}),
    },
  });

  return { userId: user.id, slug: user.slug };
}

export async function refreshPutioAccessToken(
  userId: string,
  encryptedRefreshToken?: string,
): Promise<string> {
  const env = getEnv();
  if (!env.PUTIO_CLIENT_ID || !env.PUTIO_CLIENT_SECRET) {
    throw new ValidationError(
      'PUTIO_CLIENT_ID and PUTIO_CLIENT_SECRET are required to refresh OAuth tokens',
    );
  }

  const stored = await prisma.oAuthToken.findUnique({
    where: { userId },
  });
  if (!stored?.refreshToken && !encryptedRefreshToken) {
    throw new ValidationError('No refresh token stored for this user');
  }

  const refreshToken = decryptSecret(
    encryptedRefreshToken ?? stored!.refreshToken!,
    requireSecretKey(),
  );

  const response = await fetch('https://api.put.io/v2/oauth2/access_token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: env.PUTIO_CLIENT_ID,
      client_secret: env.PUTIO_CLIENT_SECRET,
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new ValidationError(`OAuth token refresh failed: ${body}`);
  }

  const payload = (await response.json()) as OAuthTokenResponse;
  if (!payload.access_token) {
    throw new ValidationError('OAuth refresh response missing access_token');
  }

  await savePutioAccessToken(payload.access_token, {
    userId,
    refreshToken: payload.refresh_token ?? refreshToken,
    expiresInSeconds: payload.expires_in ?? null,
  });

  return payload.access_token;
}

export async function exchangeOAuthCode(
  code: string,
  redirectUri: string,
): Promise<string> {
  const env = getEnv();
  if (!env.PUTIO_CLIENT_ID || !env.PUTIO_CLIENT_SECRET) {
    throw new ValidationError('PUTIO_CLIENT_ID and PUTIO_CLIENT_SECRET are required for OAuth');
  }

  const response = await fetch('https://api.put.io/v2/oauth2/access_token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      client_id: env.PUTIO_CLIENT_ID,
      client_secret: env.PUTIO_CLIENT_SECRET,
      redirect_uri: redirectUri,
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new ValidationError(`OAuth token exchange failed: ${body}`);
  }

  const payload = (await response.json()) as OAuthTokenResponse;
  if (!payload.access_token) {
    throw new ValidationError('OAuth response missing access_token');
  }

  await savePutioAccessToken(payload.access_token, {
    refreshToken: payload.refresh_token ?? null,
    expiresInSeconds: payload.expires_in ?? null,
  });

  return payload.access_token;
}

export async function pollOobCode(code: string): Promise<string | null> {
  const response = await fetch(
    `https://api.put.io/v2/oauth2/oob/code/${encodeURIComponent(code)}`,
  );

  if (!response.ok) {
    const body = await response.text();
    throw new ValidationError(`OOB poll failed: ${body}`);
  }

  const payload = (await response.json()) as {
    feed?: { oauth_token?: string };
    oauth_token?: string;
  };

  return payload.feed?.oauth_token ?? payload.oauth_token ?? null;
}

export async function requestOobCode(clientName: string): Promise<string> {
  const env = getEnv();
  if (!env.PUTIO_CLIENT_ID) {
    throw new ValidationError('PUTIO_CLIENT_ID is required for OOB authentication');
  }

  const url = new URL('https://api.put.io/v2/oauth2/oob/code');
  url.searchParams.set('app_id', env.PUTIO_CLIENT_ID);
  url.searchParams.set('client_name', clientName);

  const response = await fetch(url);
  if (!response.ok) {
    const body = await response.text();
    throw new ValidationError(`OOB code request failed: ${body}`);
  }

  const payload = (await response.json()) as {
    feed?: { code?: string };
    code?: string;
  };

  const oobCode = payload.feed?.code ?? payload.code;
  if (!oobCode) {
    throw new ValidationError('OOB response missing code');
  }

  return oobCode;
}
