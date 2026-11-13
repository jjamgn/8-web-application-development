import 'dotenv/config';
import { prisma } from '../src/db.js';
import { dishes, specialties } from '../src/data.js';
const prefix = 'B7 · ';
async function main() {
  const missing = Math.max(0, 1000 - await prisma.dish.count());
  if (!missing) { console.log('Supabase đã có ít nhất 1.000 món; không thêm hoặc sửa dữ liệu.'); return; }
  let chefs = await prisma.chef.findMany({ orderBy: { id: 'asc' } });
  if (!chefs.length) {
    const specialtyName = specialties[0];
    const specialty = await prisma.specialty.upsert({ where: { name: specialtyName }, update: {}, create: { name: specialtyName } });
    chefs = [await prisma.chef.create({ data: {
      name: 'Đầu bếp Bếp Nhà', bio: '',
      specialties: { create: { specialty: { connect: { id: specialty.id } } } },
    } })];
  }
  const existing = new Set((await prisma.dish.findMany({ where: { name: { startsWith: prefix } }, select: { name: true } })).map(d => d.name));
  const data = Array.from({ length: 1000 }, (_, i) => {
    const dish = dishes[i % dishes.length];
    return { name: `${prefix}${dish.name} ${String(i + 1).padStart(4, '0')}`, description: `${dish.description} Thực đơn theo mùa số ${i + 1}.`, category: dish.category, price: i % 23 === 0 ? 0 : 35000 + (i % 80) * 2500, available: i % 5 !== 0, chefId: chefs[i % chefs.length].id, imagePath: dish.imagePath };
  }).filter(d => !existing.has(d.name)).slice(0, missing);
  // Only adds missing names owned by this seed. Never resets or deletes existing dishes.
  for (let i = 0; i < data.length; i += 100) await prisma.dish.createMany({ data: data.slice(i, i + 100) });
  console.log(`Đã thêm ${data.length} món Block 7; tổng DB: ${await prisma.dish.count()} món.`);
}
main().catch(() => { console.error('Seed Block 7 thất bại. Kiểm tra kết nối và migration.'); process.exitCode = 1; }).finally(() => prisma.$disconnect());
