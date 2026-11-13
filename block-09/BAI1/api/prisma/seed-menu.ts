import 'dotenv/config';
import { mkdir, writeFile } from 'node:fs/promises';
import { prisma } from '../src/db.js';
import { buildMenuCatalog } from './menu-catalog.js';

const target = 1000;
const dryRun = process.argv.includes('--dry-run');
const repairs = [
  { originalName: 'cá', name: 'Cá lóc hấp hành', description: 'Cá lóc hấp cùng hành lá, gừng thái sợi và nước tương. Thịt cá mềm ngọt, dùng nóng cùng rau thơm và nước chấm thanh nhẹ.', category: 'Món chính', ingredients: [{name:'Cá lóc',quantity:250,unit:'g'},{name:'Hành lá',quantity:20,unit:'g'},{name:'Gừng',quantity:15,unit:'g'},{name:'Nước tương',quantity:15,unit:'ml'}] },
  { originalName: 'tôm', name: 'Tôm hấp nước dừa', description: 'Tôm tươi hấp với nước dừa, sả đập dập và một chút muối. Tôm vừa chín tới, thịt săn ngọt, giữ hương thơm tự nhiên của nước dừa và sả.', category: 'Món chính', ingredients: [{name:'Tôm',quantity:250,unit:'g'},{name:'Nước dừa',quantity:150,unit:'ml'},{name:'Sả',quantity:20,unit:'g'},{name:'Muối',quantity:2,unit:'g'}] },
  { originalName: 'bún trộn', name: 'Bún trộn đậu hũ rau thơm', description: 'Bún tươi trộn với đậu hũ áp chảo, dưa leo thái sợi và rau thơm. Dùng cùng nước tương pha chanh, thêm đậu phộng rang cho vị bùi giòn.', category: 'Món chay', ingredients: [{name:'Bún tươi',quantity:180,unit:'g'},{name:'Đậu hũ',quantity:120,unit:'g'},{name:'Dưa leo',quantity:60,unit:'g'},{name:'Rau thơm',quantity:20,unit:'g'},{name:'Nước tương',quantity:20,unit:'ml'},{name:'Chanh',quantity:20,unit:'g'},{name:'Đậu phộng',quantity:15,unit:'g'}] },
];
async function main() {
  const result = await prisma.$transaction(async tx => {
    await tx.$executeRaw`LOCK TABLE "Dish" IN SHARE ROW EXCLUSIVE MODE`;
    const existing = await tx.dish.findMany({ orderBy: { id: 'asc' } });
    const repairRows = repairs.flatMap(repair => {
      const row = existing.find(dish => dish.name === repair.originalName);
      return row ? [{ ...repair, id: row.id }] : [];
    });
    const originals = existing.filter(row => !/ — Phiên bản \d{4}$/.test(row.name));
    const replace = existing.filter(row => / — Phiên bản \d{4}$/.test(row.name));
    const names = new Set(originals.map(row => row.name));
    const needed = Math.max(0, target - originals.length);
    const catalog = buildMenuCatalog().filter(row => !names.has(row.name)).slice(0, needed);
    if (catalog.length !== needed || new Set(catalog.map(row => row.name)).size !== needed) throw new Error('INVALID_CATALOG');
    const chefs = await tx.chef.findMany({ orderBy: { id: 'asc' } });
    const vegetarian = chefs.find(row => /chay/i.test(row.specialty));
    const savory = chefs.filter(row => row.id !== vegetarian?.id);
    if (!vegetarian || !savory.length || chefs.some(row => !row.name || !row.specialty || !row.bio.trim())) throw new Error('INCOMPLETE_CHEF_INFORMATION');
    if (dryRun) return { before: existing.length, replace: replace.length, add: Math.max(0, needed - replace.length), preserve: originals.length, after: originals.length + catalog.length, dryRun };
    const directory = new URL('../../docs/menu-images/', import.meta.url);
    await mkdir(directory, { recursive: true });
    await writeFile(new URL('before-correction.json', directory), JSON.stringify(await tx.dish.findMany({include:{ingredients:true}}), null, 2), {flag:'wx'}).catch(error => { if (error.code !== 'EEXIST') throw error; });
    const allParts = [...catalog.flatMap(row => row.ingredients), ...repairRows.flatMap(row => row.ingredients)];
    const ingredientInput = new Map(allParts.map(row => [row.name, row]));
    await tx.ingredient.createMany({ data: [...ingredientInput.values()].map(row => ({ name: row.name, unit: row.unit })), skipDuplicates: true });
    const ingredients = new Map((await tx.ingredient.findMany()).map(row => [row.name, row]));
    for (const row of allParts) if (ingredients.get(row.name)?.unit !== row.unit) throw new Error('INGREDIENT_UNIT_MISMATCH');
    for (const row of repairRows) {
      await tx.dish.update({ where: {id: row.id}, data: {name:row.name,description:row.description,category:row.category} });
      await tx.dishIngredient.deleteMany({ where: {dishId:row.id} });
    }
    await tx.dish.updateMany({ where:{name:'Panna cotta dừa xoài',category:'Khai vị'}, data:{category:'Tráng miệng'} });
    const updates = catalog.slice(0, replace.length).map((row, index) => ({
      id: replace[index].id, name: row.name, description: row.description, category: row.category,
      price: row.price, chefId: row.chefRole === 'vegetarian' ? vegetarian.id : savory[index % savory.length].id,
    }));
    if (updates.length) {
      const payload = JSON.stringify(updates);
      await tx.$executeRaw`
        UPDATE "Dish" AS d SET name = v.name, description = v.description,
          category = v.category, price = v.price, "chefId" = v."chefId", "updatedAt" = NOW()
        FROM jsonb_to_recordset(${payload}::jsonb)
          AS v(id int, name text, description text, category text, price numeric, "chefId" int)
        WHERE d.id = v.id`;
      await tx.dishIngredient.deleteMany({ where: { dishId: { in: updates.map(row => row.id) } } });
    }
    const added = await tx.dish.createManyAndReturn({
      data: catalog.slice(replace.length).map((row, index) => ({
        name: row.name, description: row.description, category: row.category, price: row.price,
        chefId: row.chefRole === 'vegetarian' ? vegetarian.id : savory[index % savory.length].id,
        imagePath: '/images/beef.png', available: true,
      })), select: { id: true, name: true },
    });
    const ids = new Map([...updates, ...added].map(row => [row.name, row.id]));
    const recipes = [...catalog.flatMap(row => row.ingredients.map(ingredient => ({
      dishId: ids.get(row.name)!, ingredientId: ingredients.get(ingredient.name)!.id, quantity: ingredient.quantity,
    }))), ...repairRows.flatMap(row => row.ingredients.map(ingredient => ({dishId:row.id,ingredientId:ingredients.get(ingredient.name)!.id,quantity:ingredient.quantity})))];
    for (let index = 0; index < recipes.length; index += 1000) await tx.dishIngredient.createMany({ data: recipes.slice(index, index + 1000) });
    const rows = await tx.dish.findMany({ include: { chef: true, ingredients: { include: { ingredient: true } } }, orderBy: { id: 'asc' } });
    if (rows.length !== target || new Set(rows.map(row => row.name)).size !== target || rows.some(row => row.description.trim().length < 50 || !row.chef.bio.trim() || !row.ingredients.length)) throw new Error('MENU_VERIFICATION_FAILED');
    return { before: existing.length, replaced: updates.length, added: added.length, after: rows.length, uniqueNames: new Set(rows.map(row => row.name)).size, recipes: recipes.length, dryRun };
  }, { maxWait: 10000, timeout: 120000 });
  console.log(JSON.stringify(result));
  if (!dryRun) {
    const catalog = new Map(buildMenuCatalog().map(row => [row.name, row]));
    const rows = await prisma.dish.findMany({ include: { chef: true, ingredients: { include: { ingredient: true } } }, orderBy: { id: 'asc' } });
    const directory = new URL('../../docs/menu-images/', import.meta.url);
    await mkdir(directory, { recursive: true });
    await writeFile(new URL('manifest.json', directory), JSON.stringify(rows.map(row => ({
      id: row.id, name: row.name, description: row.description, category: row.category,
      chef: row.chef, ingredients: row.ingredients.map(item => ({ name: item.ingredient.name, quantity: item.quantity.toNumber(), unit: item.ingredient.unit })),
      prompt: `Use case: photorealistic-natural. Individual square food photograph for a Vietnamese restaurant menu. Dish: ${row.name}. ${catalog.get(row.name)?.imagePrompt ?? row.description} Ingredients: ${row.ingredients.map(item => item.ingredient.name).join(', ')}. Appetizing authentic food, natural window light, warm neutral ceramics and wood table. Dish fully visible, realistic ingredients, no text, no logo, no watermark, exactly one standalone photograph, not a collage.`,
      output: `/images/generated/dish-${row.id}.png`,
    })), null, 2));
    console.log('Saved docs/menu-images/manifest.json');
  }
}
main().catch(error => {
  const code = typeof error?.code === 'string' && /^[A-Z0-9_]+$/.test(error.code) ? error.code : /^[A-Z_]+$/.test(error?.message ?? '') ? error.message : 'SEED_FAILED';
  console.error(`Seed menu failed (${code}).`);
  process.exitCode = 1;
}).finally(() => prisma.$disconnect());
