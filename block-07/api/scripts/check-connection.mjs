import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
try {
  if (!process.env.DATABASE_URL) throw Object.assign(new Error(), { code: 'MISSING_DATABASE_URL' });
  await prisma.$queryRaw`SELECT 1`;
  const [dishes, chefs, ingredients, constraints, history] = await Promise.all([
    prisma.dish.count(), prisma.chef.count(), prisma.ingredient.count(),
    prisma.$queryRaw`SELECT conname AS name, pg_get_constraintdef(oid) AS definition FROM pg_constraint WHERE conrelid = '"Dish"'::regclass AND contype = 'c'`,
    prisma.$queryRaw`SELECT to_regclass('"_prisma_migrations"')::text AS name`,
  ]);
  let migrations = [];
  if (history[0]?.name) migrations = await prisma.$queryRaw`SELECT migration_name AS name, finished_at IS NOT NULL AS finished, rolled_back_at IS NOT NULL AS rolled_back FROM "_prisma_migrations" ORDER BY started_at`;
  console.log(JSON.stringify({ connected: true, counts: { dishes, chefs, ingredients }, constraints, migrations }, null, 2));
} catch (error) {
  const code = typeof error?.code === 'string' && /^[A-Z0-9_]+$/.test(error.code) ? error.code : 'CONNECTION_FAILED';
  console.error(`Database check failed (${code}). Check api/.env, database availability and permissions. Secret values omitted.`);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
