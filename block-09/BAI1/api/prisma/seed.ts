import 'dotenv/config';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';
import { prisma } from '../src/db.js';
import { dishes, chefs, ingredients } from '../src/data.js';

async function main(){
  if(!process.env.SUPABASE_URL||!process.env.SUPABASE_SERVICE_ROLE_KEY||!process.env.DATABASE_URL)throw new Error('Điền cấu hình Supabase trong .env trước khi seed.');
  const bucket=process.env.SUPABASE_STORAGE_BUCKET||'dish-images';
  const storage=createClient(process.env.SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false}}).storage;
  const {data:existing,error:lookup}=await storage.getBucket(bucket);
  if(lookup&&!existing){
    const {error}=await storage.createBucket(bucket,{public:true,fileSizeLimit:5*1024*1024,allowedMimeTypes:['image/png','image/jpeg','image/webp']});
    if(error)throw new Error('Không tạo được bucket. Kiểm tra service role key và quyền Storage.');
  }else if(existing&&!existing.public)throw new Error('Bucket ảnh cần được đặt public; seed không tự thay đổi bucket đã có.');
  const {data:stored,error:listError}=await storage.from(bucket).list('seed',{limit:100});
  if(listError)throw new Error('Không đọc được danh sách ảnh mẫu trên Storage.');
  const storedNames=new Set((stored||[]).map(x=>x.name));
  const paths=new Map<string,string>();
  for(const dish of dishes){
    if(paths.has(dish.imagePath))continue;
    const filename=dish.imagePath.split('/').pop()!;
    const objectPath=`seed/${filename}`;
    if(!storedNames.has(filename)){
      const bytes=await readFile(fileURLToPath(new URL(`../public/images/${filename}`,import.meta.url)));
      const {error}=await storage.from(bucket).upload(objectPath,bytes,{contentType:'image/png',upsert:false});
      if(error)throw new Error(`Không tải được ảnh mẫu ${filename}.`);
    }
    paths.set(dish.imagePath,objectPath);
  }
  console.log('Đã chuẩn bị đủ 8 ảnh trên Storage. Đang ghi dữ liệu mẫu...');
  // The transaction is repeatable: existing demo IDs are kept untouched.
  await prisma.$transaction(async tx=>{
    for(const c of chefs)await tx.chef.upsert({where:{id:c.id},update:{},create:c});
    for(const i of ingredients)await tx.ingredient.upsert({where:{id:i.id},update:{},create:i});
    for(const d of dishes)await tx.dish.upsert({where:{id:d.id},update:{},create:{id:d.id,name:d.name,description:d.description,category:d.category,price:d.price,chefId:d.chefId,available:d.available,imagePath:paths.get(d.imagePath)!,ingredients:{create:d.ingredients.map(r=>({ingredientId:r.ingredientId,quantity:r.quantity}))}}});
    // Explicit seed IDs must advance each sequence before admin can insert new records.
    await tx.$executeRaw`SELECT setval(pg_get_serial_sequence('"Chef"','id'), COALESCE((SELECT MAX(id) FROM "Chef"),1),true)`;
    await tx.$executeRaw`SELECT setval(pg_get_serial_sequence('"Ingredient"','id'), COALESCE((SELECT MAX(id) FROM "Ingredient"),1),true)`;
    await tx.$executeRaw`SELECT setval(pg_get_serial_sequence('"Dish"','id'), COALESCE((SELECT MAX(id) FROM "Dish"),1),true)`;
  },{maxWait:10000,timeout:60000});
  console.log('Seed hoàn tất: 8 món ăn, 3 đầu bếp, 10 nguyên liệu và 8 ảnh trong Supabase Storage.');
}
main().catch((error)=>{const code=typeof error?.code==='string'&&/^[A-Z0-9_]+$/.test(error.code)?` (${error.code})`:'';console.error(`Seed chưa hoàn tất${code}. Kiểm tra cấu hình, migration và quyền truy cập Supabase. Không có thông tin kết nối nào được ghi ra log.`);process.exitCode=1;}).finally(()=>prisma.$disconnect());
