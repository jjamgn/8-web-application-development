import 'dotenv/config';
import express, { type Request, type Response, type NextFunction } from 'express';
import session from 'express-session';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import methodOverride from 'method-override';
import multer from 'multer';
import bcrypt from 'bcryptjs';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { fileURLToPath } from 'node:url';
import { prisma, demo, imageUrl } from './db.js';
import { dishes, chefs, ingredients, categories } from './data.js';
import { schemas, validId } from './validation.js';

declare module 'express-session' { interface SessionData { admin?:boolean; csrf?:string; } }
export const app=express();
const root=fileURLToPath(new URL('../',import.meta.url));
if(!demo && (!process.env.DATABASE_URL || !process.env.SESSION_SECRET || !process.env.ADMIN_PASSWORD_HASH)) throw new Error('Thiếu cấu hình database hoặc quản trị. Xem .env.example.');
if(process.env.NODE_ENV==='production' && demo) throw new Error('Không chạy DEMO_MODE trong production.');
app.disable('x-powered-by');
app.set('view engine','ejs');
app.set('views',`${root}/views`);
app.use(helmet({contentSecurityPolicy:{directives:{'img-src':["'self'",'https:','data:'], 'style-src':["'self'",'https://fonts.googleapis.com'], 'font-src':["'self'",'https://fonts.gstatic.com'], 'script-src':["'self'"], 'connect-src':["'self'"], 'form-action':["'self'"]}}}));
app.use(express.static(`${root}/public`));
app.use(express.urlencoded({extended:false,limit:'100kb'}));
app.use(session({secret:process.env.SESSION_SECRET||randomBytes(48).toString('hex'),resave:false,saveUninitialized:false,cookie:{httpOnly:true,sameSite:'lax',secure:process.env.NODE_ENV==='production',maxAge:2*60*60*1000}}));
app.use((req,res,next)=>{
  req.session.csrf ||= randomBytes(32).toString('hex');
  Object.assign(res.locals,{csrf:req.session.csrf,demo,admin:req.session.admin,categories,imageUrl,money:(v:unknown)=>new Intl.NumberFormat('vi-VN',{style:'currency',currency:'VND',maximumFractionDigits:0}).format(Number(v)),path:req.path,title:'Bếp Nhà',error:'',values:{},errors:{},notice:typeof req.query.notice==='string'?req.query.notice:''});
  next();
});
function csrf(req:Request,res:Response,next:NextFunction){
  const token=req.body?._csrf;
  if(typeof token!=='string'||!/^[a-f0-9]{64}$/.test(token)||!req.session.csrf||!timingSafeEqual(Buffer.from(token),Buffer.from(req.session.csrf))) return res.status(403).render('error',{title:'Phiên làm việc hết hạn',message:'Vui lòng tải lại trang và gửi biểu mẫu một lần nữa.'});
  next();
}
function adminOnly(req:Request,res:Response,next:NextFunction){if(demo||req.session.admin)return next();res.redirect(303,'/admin/login');}
function writable(_req:Request,res:Response,next:NextFunction){if(demo)return res.status(503).render('error',{title:'Chế độ xem thử',message:'Thao tác ghi chưa bật. Hãy cấu hình Supabase và tài khoản quản trị trong .env, sau đó đặt DEMO_MODE=false.'});next();}
const upload=multer({storage:multer.memoryStorage(),limits:{fileSize:5*1024*1024,files:1,fields:80}});
const include={chef:true,ingredients:{include:{ingredient:true}}};
type Kind='dishes'|'chefs'|'ingredients';
const metadata={dishes:{label:'món ăn',title:'Món ăn'},chefs:{label:'đầu bếp',title:'Đầu bếp'},ingredients:{label:'nguyên liệu',title:'Nguyên liệu'}};
function kindOf(req:Request):Kind|null { const k=String(req.params.kind);return Object.hasOwn(metadata,k)?k as Kind:null; }
function pageOf(v:unknown){const n=Number(v);return Number.isSafeInteger(n)&&n>0?Math.min(n,100000):1;}
function queryString(req:Request){return (key:string,value:unknown)=>{const q=new URLSearchParams();for(const [k,v]of Object.entries(req.query))if(typeof v==='string')q.set(k,v);q.set(key,String(value));if(key!=='page')q.delete('page');return `${req.path}?${q}`;};}
async function record(kind:Kind,id:number):Promise<any>{
  if(demo)return ({dishes,chefs,ingredients}[kind] as any[]).find(x=>x.id===id)||null;
  if(kind==='dishes')return prisma.dish.findUnique({where:{id},include});
  if(kind==='chefs')return prisma.chef.findUnique({where:{id},include:{_count:{select:{dishes:true}}}});
  return prisma.ingredient.findUnique({where:{id},include:{_count:{select:{dishes:true}}}});
}
async function choices(){return demo?{chefs,ingredients}:{chefs:await prisma.chef.findMany({orderBy:{name:'asc'}}),ingredients:await prisma.ingredient.findMany({orderBy:{name:'asc'}})};}
function notFound(res:Response){return res.status(404).render('error',{title:'Không tìm thấy trang',message:'Món ăn hoặc trang bạn tìm không tồn tại. Hãy quay lại thực đơn để khám phá những hương vị khác.'});}
async function listing(req:Request,kind:Kind,size:number){
  const q=typeof req.query.q==='string'?req.query.q.trim().slice(0,160):'';
  const category=typeof req.query.category==='string'?req.query.category:'';
  const available=['true','false'].includes(String(req.query.available))?String(req.query.available):'';
  const sort=['price-asc','price-desc','name'].includes(String(req.query.sort))?String(req.query.sort):'newest';
  let page=pageOf(req.query.page);
  let total=0,items:any[]=[];
  if(demo){
    items=([...({dishes,chefs,ingredients}[kind])] as any[]).filter(x=>x.name.toLocaleLowerCase('vi').includes(q.toLocaleLowerCase('vi'))&&(kind!=='dishes'||((!category||x.category===category)&&(!available||x.available===(available==='true')))));
    items.sort((a,b)=>sort==='name'?a.name.localeCompare(b.name,'vi'):sort==='price-asc'?a.price-b.price:sort==='price-desc'?b.price-a.price:a.id-b.id);
    total=items.length;page=Math.min(page,Math.max(1,Math.ceil(total/size)));items=items.slice((page-1)*size,page*size);
  }else{
    const where:any={name:{contains:q,mode:'insensitive'}};
    if(kind==='dishes'){if(category)where.category=category;if(available)where.available=available==='true';}
    const model:any=kind==='dishes'?prisma.dish:kind==='chefs'?prisma.chef:prisma.ingredient;
    total=await model.count({where});page=Math.min(page,Math.max(1,Math.ceil(total/size)));
    const orderBy=sort==='name'?{name:'asc'}:kind==='dishes'&&sort.startsWith('price-')?{price:sort==='price-asc'?'asc':'desc'}:{id:'asc'};
    items=await model.findMany({where,orderBy:[orderBy,{id:'asc'}],skip:(page-1)*size,take:size,...(kind==='dishes'?{include}:{})});
  }
  return {items,total,page,pages:Math.max(1,Math.ceil(total/size)),size,q,category,available,sort,link:queryString(req)};
}
app.get('/',(_req,res)=>res.redirect('/dishes'));
app.get('/dishes',async(req,res)=>res.render('menu',{title:'Thực đơn · Bếp Nhà',...await listing(req,'dishes',6)}));
app.get(['/dishes/:id','/dish/:id'],async(req,res)=>{
  const id=validId(String(req.params.id));if(!id)return notFound(res);
  const dish=await record('dishes',id);if(!dish)return notFound(res);
  const related=demo?dishes.filter(x=>x.id!==id&&x.category===dish.category).slice(0,3):await prisma.dish.findMany({where:{id:{not:id},category:dish.category},include,take:3});
  res.render('detail',{title:`${dish.name} · Bếp Nhà`,dish,related});
});
const loginLimit=rateLimit({windowMs:15*60*1000,limit:15,standardHeaders:'draft-7',legacyHeaders:false});
app.get('/admin/login',(_req,res)=>res.render('login',{title:'Đăng nhập quản trị'}));
app.post('/admin/login',loginLimit,csrf,async(req,res,next)=>{
  if(demo)return res.redirect(303,'/admin/dishes');
  const email=String(req.body.email||'');const password=String(req.body.password||'');
  if(email!==process.env.ADMIN_EMAIL||!await bcrypt.compare(password,process.env.ADMIN_PASSWORD_HASH!))return res.status(400).render('login',{title:'Đăng nhập quản trị',error:'Email hoặc mật khẩu chưa đúng.',values:{email}});
  req.session.regenerate(err=>{if(err)return next(err);req.session.admin=true;req.session.save(err=>err?next(err):res.redirect(303,'/admin/dishes'));});
});
app.post('/admin/logout',csrf,(req,res,next)=>req.session.destroy(err=>err?next(err):res.redirect(303,'/dishes')));
app.use('/admin',adminOnly);
app.get('/admin',(_req,res)=>res.redirect('/admin/dishes'));
app.get('/admin/:kind',async(req,res)=>{
  const kind=kindOf(req);if(!kind)return notFound(res);
  const counts=demo?{dishes:dishes.length,chefs:chefs.length,ingredients:ingredients.length}:{dishes:await prisma.dish.count(),chefs:await prisma.chef.count(),ingredients:await prisma.ingredient.count()};
  res.render('admin-list',{title:`Quản lý ${metadata[kind].label}`,kind,meta:metadata[kind],counts,...await listing(req,kind,8)});
});
app.get('/admin/:kind/new',async(req,res)=>{const kind=kindOf(req);if(!kind)return notFound(res);res.render('form',{title:`Thêm ${metadata[kind].label}`,kind,meta:metadata[kind],editing:false,values:kind==='dishes'?{available:true,category:categories[0],ingredients:[]}: {},...await choices()});});
app.get('/admin/:kind/:id/edit',async(req,res)=>{
  const kind=kindOf(req),id=validId(String(req.params.id));if(!kind||!id)return notFound(res);
  const item=await record(kind,id);if(!item)return notFound(res);
  res.render('form',{title:`Sửa ${metadata[kind].label}`,kind,meta:metadata[kind],editing:true,values:item,...await choices()});
});
app.get('/admin/:kind/:id/delete',async(req,res)=>{
  const kind=kindOf(req),id=validId(String(req.params.id));if(!kind||!id)return notFound(res);
  const item=await record(kind,id);if(!item)return notFound(res);
  res.render('delete',{title:'Xác nhận xóa',kind,meta:metadata[kind],item});
});
// Parse multipart before method override and CSRF. Only POST may override, and only to PATCH/DELETE.
app.use('/admin', (req,res,next)=>['POST','PATCH','DELETE'].includes(req.method)?writable(req,res,next):next());
app.use('/admin',(req,res,next)=>upload.single('image')(req,res,async(err:any)=>{
  if(!err)return next();
  const match=req.path.match(/^\/(dishes|chefs|ingredients)(?:\/([1-9]\d*))?\/?$/);
  if(!(err instanceof multer.MulterError)||!match)return next(err);
  try{
    const kind=match[1] as Kind;const editing=Boolean(match[2]);
    const current=editing?await record(kind,Number(match[2])):null;
    if(editing&&!current)return notFound(res);
    const options=await choices();
    const values={...req.body,id:current?.id,imagePath:current?.imagePath,available:req.body?.available==='on',ingredients:options.ingredients.map((i:any)=>({ingredientId:i.id,quantity:req.body?.[`qty_${i.id}`]||''}))};
    return res.status(400).render('form',{title:`${editing?'Sửa':'Thêm'} ${metadata[kind].label}`,kind,meta:metadata[kind],editing,values,error:'Ảnh tối đa 5 MB, chỉ một file cho mỗi món. Vui lòng chọn lại ảnh hợp lệ.',...options});
  }catch(e){next(e);}
}));
app.use('/admin',methodOverride((req)=>req.method==='POST'&&['PATCH','DELETE'].includes(String(req.body?._method))?req.body._method:undefined,{methods:['POST']}));
app.use('/admin',(req,res,next)=>['POST','PATCH','DELETE'].includes(req.method)?csrf(req,res,next):next());

function recipeInput(body:any,allIngredients:any[]){
  const result:{ingredientId:number;quantity:number}[]=[];
  for(const ingredient of allIngredients){
    const raw=body[`qty_${ingredient.id}`];if(raw===''||raw===undefined)continue;
    const quantity=Number(raw);
    if(!Number.isFinite(quantity)||quantity<=0||quantity>99999999||Math.abs(quantity*100-Math.round(quantity*100))>0.00001)throw new Error(`Số lượng ${ingredient.name} phải dương, tối đa 2 chữ số thập phân.`);
    result.push({ingredientId:ingredient.id,quantity});
  }
  return result;
}
function fileValid(file:Express.Multer.File){
  const b=file.buffer;
  return file.mimetype==='image/png'?b.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])):file.mimetype==='image/jpeg'?b[0]===255&&b[1]===216&&b[2]===255:file.mimetype==='image/webp'&&b.subarray(0,4).toString()==='RIFF'&&b.subarray(8,12).toString()==='WEBP';
}
function storage(){if(!process.env.SUPABASE_URL||!process.env.SUPABASE_SERVICE_ROLE_KEY)throw new Error('Chưa cấu hình Supabase Storage.');return createClient(process.env.SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false}}).storage.from(process.env.SUPABASE_STORAGE_BUCKET||'dish-images');}
async function save(req:Request,res:Response){
  const kind=kindOf(req);if(!kind)return notFound(res);
  const editing=req.method==='PATCH';const id=editing?validId(String(req.params.id)):null;
  const existing=editing&&id?await record(kind,id):null;if(editing&&!existing)return notFound(res);
  const options=await choices();const parsed=schemas[kind].safeParse(req.body);
  const values:any={...req.body,id:existing?.id,available:req.body.available==='on',imagePath:existing?.imagePath,ingredients:[]};
  values.ingredients=options.ingredients.filter((i:any)=>req.body[`qty_${i.id}`]!==undefined).map((i:any)=>({ingredientId:i.id,quantity:req.body[`qty_${i.id}`]}));
  const renderError=(error:string,errors:any={})=>res.status(400).render('form',{title:`${editing?'Sửa':'Thêm'} ${metadata[kind].label}`,kind,meta:metadata[kind],editing,values,error,errors,...options});
  if(!parsed.success)return renderError('Vui lòng kiểm tra các trường được đánh dấu.',parsed.error.flatten().fieldErrors);
  let recipe:{ingredientId:number;quantity:number}[]=[];
  if(kind==='dishes'){
    if(!options.chefs.some((c:any)=>c.id===(parsed.data as any).chefId))return renderError('Đầu bếp không tồn tại.');
    try{recipe=recipeInput(req.body,options.ingredients);}catch(e){return renderError((e as Error).message);}
    if(!existing&&!req.file)return renderError('Vui lòng chọn ảnh PNG, JPEG hoặc WebP (tối đa 5 MB).');
    if(req.file&&!fileValid(req.file))return renderError('File ảnh không hợp lệ. Vui lòng chọn lại.');
  }
  let uploaded:string|undefined;
  try{
    if(kind==='dishes'&&req.file){
      uploaded=`uploads/${randomBytes(18).toString('hex')}.${{ 'image/png':'png','image/jpeg':'jpg','image/webp':'webp'}[req.file.mimetype]}`;
      const {error}=await storage().upload(uploaded,req.file.buffer,{contentType:req.file.mimetype,upsert:false});if(error)throw error;
    }
    if(kind==='dishes'){
      const data={...parsed.data,imagePath:uploaded||existing?.imagePath} as any;
      if(editing)await prisma.$transaction(async tx=>{await tx.dishIngredient.deleteMany({where:{dishId:id!}});await tx.dish.update({where:{id:id!},data:{...data,ingredients:{create:recipe}}});});
      else await prisma.dish.create({data:{...data,ingredients:{create:recipe}}});
    }else{
      const model:any=kind==='chefs'?prisma.chef:prisma.ingredient;
      if(editing)await model.update({where:{id},data:parsed.data});else await model.create({data:parsed.data});
    }
  }catch(e:any){
    if(uploaded)await storage().remove([uploaded]).catch(()=>{});
    if(e.code==='P2025')return notFound(res);
    return renderError(e.code==='P2002'?'Tên này đã tồn tại.':e.code==='P2003'?'Dữ liệu liên quan đã thay đổi. Vui lòng kiểm tra lại.':'Không lưu được dữ liệu. Kiểm tra kết nối database và Storage, sau đó thử lại.');
  }
  if(uploaded&&existing?.imagePath?.startsWith('uploads/'))await storage().remove([existing.imagePath]).catch(()=>{});
  res.redirect(303,`/admin/${kind}?notice=${encodeURIComponent(editing?'Đã cập nhật thành công.':'Đã thêm thành công.')}`);
}
app.post('/admin/:kind',save);
app.patch('/admin/:kind/:id',save);
app.delete('/admin/:kind/:id',async(req,res)=>{
  const kind=kindOf(req),id=validId(String(req.params.id));if(!kind||!id)return notFound(res);
  const item=await record(kind,id);if(!item)return notFound(res);
  try{if(kind==='dishes')await prisma.dish.delete({where:{id}});else if(kind==='chefs')await prisma.chef.delete({where:{id}});else await prisma.ingredient.delete({where:{id}});}
  catch(e:any){if(e.code==='P2025')return notFound(res);if(e.code!=='P2003')throw e;return res.status(400).render('delete',{title:'Chưa thể xóa',kind,meta:metadata[kind],item,error:'Dữ liệu đang được sử dụng bởi món ăn. Hãy cập nhật các món liên quan trước.'});}
  if(kind==='dishes'&&item.imagePath.startsWith('uploads/'))await storage().remove([item.imagePath]).catch(()=>{});
  res.redirect(303,`/admin/${kind}?notice=${encodeURIComponent('Đã xóa thành công.')}`);
});
app.use((_req,res)=>notFound(res));
app.use((err:any,_req:Request,res:Response,_next:NextFunction)=>{
  const bad=err instanceof multer.MulterError||err.status===400||err.status===413;
  // Never log database errors or connection strings.
  res.status(bad?400:500).render('error',{title:bad?'Biểu mẫu không hợp lệ':'Chưa thể tải dữ liệu',message:bad?'File tối đa 5 MB; kiểm tra biểu mẫu và thử lại.':'Vui lòng kiểm tra cấu hình Supabase và kết nối mạng, sau đó thử lại.'});
});
