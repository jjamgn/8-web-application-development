import { Prisma } from '@prisma/client';

export type Kind = 'dishes' | 'chefs' | 'ingredients';
export type AccessUser = {
  id: number; role: string; chefId: number | null; status: string;
  emailVerifiedAt: Date | null; passwordVersion: number;
};
export type AccessDish = { chefId: number; status: string };
export const canRead = (u: AccessUser | null | undefined): u is AccessUser =>
  !!u && u.status === 'active' && !!u.emailVerifiedAt &&
  ['viewer', 'editor', 'admin'].includes(u.role) && (u.role !== 'editor' || Number.isInteger(u.chefId));
export const canCreate = (u: AccessUser | null | undefined, kind: Kind) =>
  canRead(u) && (u.role === 'admin' || (u.role === 'editor' && kind === 'dishes'));
export const canEdit = (u: AccessUser | null | undefined, kind: Kind, dish?: AccessDish) =>
  canRead(u) && (u.role === 'admin' || (u.role === 'editor' && kind === 'dishes' &&
    !!dish && dish.chefId === u.chefId && dish.status === 'draft'));
export const canDelete = (u: AccessUser | null | undefined, _kind: Kind) => canRead(u) && u.role === 'admin';

export class AccessDenied extends Error { readonly status = 403; }
export class MissingRecord extends Error { readonly status = 404; }

// Lock the authorization rows until commit. A concurrent role/ownership/status
// change must serialize with the actual write, including recipe replacement.
function table(name: 'User' | 'Dish', schema?: string) {
  const namespace = schema ?? new URL(process.env.DATABASE_URL!).searchParams.get('schema') ?? 'public';
  // Identifier comes only from server configuration; quote embedded quotes.
  return Prisma.raw(`"${namespace.replace(/"/g, '""')}"."${name}"`);
}
export async function lockActor(tx: Prisma.TransactionClient, id: number, version?: number, schema?: string): Promise<AccessUser> {
  await tx.$queryRaw`SELECT id FROM ${table('User', schema)} WHERE id = ${id} FOR UPDATE`;
  const user = await tx.user.findUnique({ where: { id } });
  if (!canRead(user) || user.passwordVersion !== version) throw new AccessDenied();
  return user;
}
export async function lockDish(tx: Prisma.TransactionClient, id: number, schema?: string) {
  await tx.$queryRaw`SELECT id FROM ${table('Dish', schema)} WHERE id = ${id} FOR UPDATE`;
  const dish = await tx.dish.findUnique({ where: { id } });
  if (!dish) throw new MissingRecord();
  return dish;
}
