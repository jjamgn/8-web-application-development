import 'dotenv/config';
let missing=0;
for(const key of ['DATABASE_URL','DIRECT_URL','SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY','SESSION_SECRET','ADMIN_EMAIL','ADMIN_PASSWORD_HASH']){
  const v=process.env[key]||'';let ok=Boolean(v.trim());
  if(ok&&['DATABASE_URL','DIRECT_URL'].includes(key)){try{const u=new URL(v);ok=['postgres:','postgresql:'].includes(u.protocol)&&Boolean(u.hostname&&u.password)&&!/[\[\]]/.test(v);}catch{ok=false;}}
  if(ok&&key==='SUPABASE_URL'){try{ok=new URL(v).protocol==='https:';}catch{ok=false;}}
  if(ok&&key==='SESSION_SECRET')ok=v.length>=32;
  if(ok&&key==='ADMIN_PASSWORD_HASH')ok=/^\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}$/.test(v);
  console.log(`${key}: ${ok?'OK':'THIẾU HOẶC CHƯA HỢP LỆ'}`);if(!ok)missing++;
}
console.log(`Chế độ: ${process.env.DEMO_MODE==='true'?'xem thử':'database thật'}`);
if(process.argv.includes('--connect')&&missing===0){
  const {PrismaClient}=await import('@prisma/client');
  const p=new PrismaClient();
  try{await p.$queryRaw`SELECT 1`;console.log('PostgreSQL: kết nối thành công');}catch{console.log('PostgreSQL: chưa kết nối được; kiểm tra URL, mật khẩu, mạng và trạng thái project');process.exitCode=1;}finally{await p.$disconnect();}
  const{createClient}=await import('@supabase/supabase-js');
  try{const{error}=await createClient(process.env.SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false}}).storage.listBuckets();if(error)throw error;console.log('Supabase Storage: xác thực thành công');}catch{console.log('Supabase Storage: chưa xác thực được; kiểm tra URL và service role/secret key');process.exitCode=1;}
}
if(missing)process.exitCode=1;
