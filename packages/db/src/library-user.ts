import { NotFoundError } from '@putio-stremio/shared';
import { prisma } from './client.js';
import { getDefaultUser, getUserBySlug } from './parse.js';

export async function requireLibraryUser(userId?: string) {
  const user = userId
    ? await prisma.user.findUnique({ where: { id: userId } })
    : await getDefaultUser();

  if (!user) {
    throw new NotFoundError('No library user');
  }

  return user;
}

export async function resolveLibraryUserId(userSlug?: string): Promise<string | null> {
  if (!userSlug) {
    const user = await getDefaultUser();
    return user?.id ?? null;
  }

  const user = await getUserBySlug(userSlug);
  return user?.id ?? null;
}
