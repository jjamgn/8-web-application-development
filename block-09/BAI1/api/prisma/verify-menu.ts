import 'dotenv/config';
import { prisma } from '../src/db.js';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
async function main() {
  const rows = await prisma.dish.findMany({ include: { chef: true, ingredients: { include: { ingredient: true } } }, orderBy: { id: 'asc' } });
  const missingDescription = rows.filter(row => !row.description.trim()).map(row => ({ id: row.id, name: row.name }));
  const missingRecipe = rows.filter(row => !row.ingredients.length).map(row => ({ id: row.id, name: row.name }));
  const missingChef = rows.filter(row => !row.chef.name.trim() || !row.chef.specialty.trim() || !row.chef.bio.trim()).map(row => ({ id: row.id, name: row.name }));
  const invalidImages:{id:number;reason:string}[]=[];const imageHashes=new Set<string>();
  if(process.argv.includes('--images')){
    for(let start=0;start<rows.length;start+=16)await Promise.all(rows.slice(start,start+16).map(async row=>{
      try{
        if(!new RegExp(`^/images/(generated|sourced)/dish-${row.id}\\.(png|jpg|webp|gif)$`).test(row.imagePath))throw new Error('missing local image path');
        const source=JSON.parse(await readFile(new URL(`../../docs/menu-images/sources/${row.id}.json`,import.meta.url),'utf8'));
        if(source.id!==row.id||source.name!==row.name||source.imagePath!==row.imagePath)throw new Error('source does not match dish');
        const bytes=await readFile(new URL(`../../web/public${row.imagePath}`,import.meta.url));
        const hash=createHash('sha256').update(bytes).digest('hex');
        if(hash!==source.hash||imageHashes.has(hash))throw new Error('image hash invalid or duplicate');
        if(source.kind==='online'&&!/^https:\/\//.test(source.sourceUrl))throw new Error('missing image source');
        imageHashes.add(hash);
      }catch(error){invalidImages.push({id:row.id,reason:error instanceof Error?error.message:'invalid image'});}
    }));
  }
  const report = { checkedAt: new Date().toISOString(), count: rows.length, uniqueNames: new Set(rows.map(row => row.name)).size,
    uniqueDescriptions: new Set(rows.map(row => row.description)).size,
    uniqueRecipes: new Set(rows.map(row => JSON.stringify(row.ingredients.map(item => [item.ingredientId,item.quantity.toNumber()]).sort((a,b)=>a[0]-b[0])))).size,
    variantCopies: rows.filter(row => / — Phiên bản \d{4}$/.test(row.name)).length,
    missingDescription, missingRecipeCount: missingRecipe.length, missingRecipe: missingRecipe.slice(0,8), missingChef,
    generatedImagePaths: rows.filter(row => /^\/images\/generated\/dish-\d+\.png$/.test(row.imagePath)).length,
    sourcedImagePaths: rows.filter(row => /^\/images\/sourced\/dish-\d+\.(jpg|png|webp|gif)$/.test(row.imagePath)).length,
    ...(process.argv.includes('--images')?{verifiedUniqueImageFiles:imageHashes.size,invalidImages}:{}),
    categories: rows.reduce<Record<string,number>>((counts,row) => ({...counts,[row.category]:(counts[row.category]??0)+1}),{}) };
  await mkdir(new URL('../../docs/menu-images/',import.meta.url),{recursive:true});
  await writeFile(new URL('../../docs/menu-images/verification.json',import.meta.url),JSON.stringify(report,null,2));
  console.log(JSON.stringify(report));
  if (report.count !== 1000 || report.uniqueNames !== 1000 || report.uniqueDescriptions !== 1000 || report.uniqueRecipes !== 1000 || missingDescription.length || missingRecipe.length || missingChef.length || report.variantCopies || invalidImages.length) process.exitCode=1;
}
main().catch(() => { console.error('Menu verification failed.'); process.exitCode=1; }).finally(() => prisma.$disconnect());
