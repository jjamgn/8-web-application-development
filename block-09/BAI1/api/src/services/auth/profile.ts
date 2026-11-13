import { profileSchema } from '../../validation/auth.js';
import { activeUser, publicUser, type AuthContext, type PublicUser } from './types.js';
import { authTransaction } from './tokens.js';

export async function updateProfile(
  ctx: Pick<AuthContext, 'db' | 'now'>,
  input: unknown,
  identity: { userId: number; familyId: string; passwordVersion: number },
): Promise<PublicUser | null> {
  const data = profileSchema.parse(input);
  return authTransaction(ctx.db, async tx => {
    const now = ctx.now();
    const user = await tx.user.findUnique({ where: { id: identity.userId } });
    if (!activeUser(user) || user.passwordVersion !== identity.passwordVersion) return null;
    const session = await tx.refreshToken.findFirst({ where: {
      userId: user.id, familyId: identity.familyId, passwordVersion: identity.passwordVersion,
      usedAt: null, revokedAt: null, expiresAt: { gt: now }, absoluteExpiresAt: { gt: now },
    } });
    if (!session) return null;
    const changed = await tx.user.updateMany({
      where: { id: user.id, passwordVersion: identity.passwordVersion },
      data: { name: data.name },
    });
    if (changed.count !== 1) return null;
    return { ...publicUser(user), name: data.name };
  });
}
