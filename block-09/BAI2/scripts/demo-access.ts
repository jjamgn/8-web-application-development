import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';

const db = new PrismaClient();
const prefix = 'B9B2-DEMO-';
const credentialFile = '.env.demo';
// Local ignored file only: plaintext never appears in repo, logs or evidence.
let password = process.env.DEMO_ACCESS_PASSWORD;
if (!password && existsSync(credentialFile)) password = readFileSync(credentialFile, 'utf8').match(/^DEMO_ACCESS_PASSWORD=(.+)$/m)?.[1];
password ||= randomBytes(24).toString('base64url');
if (password.length < 16) throw new Error('Demo password must have at least 16 characters.');
if (!existsSync(credentialFile)) writeFileSync(credentialFile, `DEMO_ACCESS_PASSWORD=${password}\n`, { mode: 0o600, flag: 'wx' });
try {
  const passwordHash = await bcrypt.hash(password, 12);
  const result = await db.$transaction(async tx => {
    const chefs = [];
    for (const name of [`${prefix}Chef-1`, `${prefix}Chef-2`]) {
      const existing = await tx.chef.findFirst({ where: { name } });
      chefs.push(existing || await tx.chef.create({ data: { name, bio: 'Dữ liệu demo Bài 2' } }));
    }
    const users = [];
    for (const [name, role, chefId] of [
      ['Viewer', 'viewer', null], ['Editor-1', 'editor', chefs[0].id],
      ['Editor-2', 'editor', chefs[1].id], ['Admin', 'admin', null]
    ] as const) {
      const email = `${prefix}${name}@example.test`.toLowerCase();
      const existing = await tx.user.findUnique({ where: { email } });
      if (existing && (existing.name !== `${prefix}${name}` || existing.role !== role || existing.chefId !== chefId)) throw new Error('DEMO_CONFLICT');
      const user = existing || await tx.user.create({ data: { email, name: `${prefix}${name}`, role, chefId, passwordHash, status: 'active', emailVerifiedAt: new Date() } });
      users.push({ id: user.id, email: user.email, role: user.role, chefId: user.chefId });
    }
    const dishes = [];
    for (const [name, chefId, status] of [
      ['Draft-1', chefs[0].id, 'draft'], ['Draft-2', chefs[1].id, 'draft'], ['Published', chefs[0].id, 'published']
    ] as const) {
      const fullName = `${prefix}${name}`;
      const existing = await tx.dish.findFirst({ where: { name: fullName } });
      if (existing && (existing.chefId !== chefId || existing.status !== status)) throw new Error('DEMO_CONFLICT');
      const dish = existing || await tx.dish.create({ data: { name: fullName, chefId, status, available: true, description: 'Dữ liệu demo phân quyền Bài 2', price: 100000, category: 'Món chính', imagePath: '/images/beef.png' } });
      dishes.push({ id: dish.id, name: dish.name, chefId: dish.chefId, status: dish.status });
    }
    return { users, chefs: chefs.map(c => ({ id: c.id, name: c.name })), dishes };
  });
  writeFileSync('docs/demo-access.json', JSON.stringify(result, null, 2) + '\n');
  console.log('Demo records ready. IDs: docs/demo-access.json; credentials: local ignored .env.demo.');
} catch {
  console.error('Demo preparation failed; transaction rolled back. Check prefix conflicts or connection.'); process.exitCode = 1;
} finally { await db.$disconnect(); }
