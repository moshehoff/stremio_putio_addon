import {
  decryptSecret,
  encryptSecret,
  getEnv,
  requireSecretKey,
  ValidationError,
} from '@putio-stremio/shared';
import { createPutioProvider } from '@putio-stremio/putio-client';
import { prisma } from './client.js';
import { getDefaultUser } from './parse.js';

export async function getPutioAccessToken(): Promise<string | null> {
  const user = await getDefaultUser();
  if (user) {
    const stored = await prisma.oAuthToken.findUnique({
      where: { userId: user.id },
    });
    if (stored) {
      return decryptSecret(stored.accessToken, requireSecretKey());
    }
  }

  return getEnv().PUTIO_TOKEN ?? null;
}

export async function hasPutioAccessToken(): Promise<boolean> {
  return (await getPutioAccessToken()) !== null;
}

export async function requirePutioAccessToken(): Promise<string> {
  const token = await getPutioAccessToken();
  if (!token) {
    throw new ValidationError(
      'Put.io is not connected. Open /configure to add your OAuth token.',
    );
  }
  return token;
}

export async function savePutioAccessToken(accessToken: string): Promise<void> {
  const trimmed = accessToken.trim();
  if (!trimmed) {
    throw new ValidationError('Put.io token is required');
  }

  const putio = createPutioProvider(trimmed);
  const account = await putio.getAccountInfo();

  const user = await prisma.user.upsert({
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

  const encrypted = encryptSecret(trimmed, requireSecretKey());
  await prisma.oAuthToken.upsert({
    where: { userId: user.id },
    create: {
      userId: user.id,
      accessToken: encrypted,
    },
    update: {
      accessToken: encrypted,
      refreshToken: null,
      expiresAt: null,
    },
  });
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

  const payload = (await response.json()) as { access_token?: string };
  if (!payload.access_token) {
    throw new ValidationError('OAuth response missing access_token');
  }

  await savePutioAccessToken(payload.access_token);
  return payload.access_token;
}
