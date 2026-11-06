import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import bcrypt from 'bcryptjs';
import {createServer} from 'node:http';
import { chefs,ingredients,dishes } from '../src/data.js';
import {stubSession,stubLoginAttempts} from './helpers/prisma-session.js';
process.env.DEMO_MODE='false';
process.env.DATABASE_URL='postgresql://test:test@localhost:5432/test';
process.env.SESSION_SECRET='test-session-secret-at-least-32-characters';
process.env.ADMIN_EMAIL='admin@example.test';
process.env.ADMIN_PASSWORD_HASH=await bcrypt.hash('test-password',4);
const {prisma}=await import('../src/db.js');
const {app}=await import('../src/app.js');
const p=prisma as any;
const state:any={chefs:chefs.map(x=>({...x})),ingredients:ingredients.map(x=>({...x})),dishes:dishes.map(x=>({...x}))};
let calls:{kind:string;op:string;args:any}[]=[];
const storageRequests:string[]=[];
const fakeStorage=createServer((req,res)=>{storageRequests.push(`${req.method} ${req.url}`);req.resume();req.on('end',()=>{res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify({Key:'dish-images/test.png',Id:'test-id'}));});});
before(async()=>{
  stubSession(p);stubLoginAttempts(p);
  const administrator={id:1,name:'Quản trị viên kiểm thử',email:'admin@example.test',passwordHash:process.env.ADMIN_PASSWORD_HASH!,emailVerifiedAt:new Date(),passwordVersion:0,role:'admin',status:'active'};
  p.user.findUnique=async(args:any)=>args.where.id===administrator.id||args.where.email===administrator.email?administrator:null;
  await new Promise<void>(resolve=>fakeStorage.listen(0,'127.0.0.1',resolve));
  const address=fakeStorage.address() as {port:number};process.env.SUPABASE_URL=`http://127.0.0.1:${address.port}`;process.env.SUPABASE_SERVICE_ROLE_KEY='test-server-only-key';
  for(const [kind,model]of [['chefs','chef'],['ingredients','ingredient'],['dishes','dish']]){
    for(const op of ['findMany','findUnique','count','create','update','delete'])p[model][op]=async(args:any={})=>{
      calls.push({kind,op,args});const rows=state[kind];
      if(op==='findMany')return rows;
      if(op==='findUnique')return rows.find((x:any)=>x.id===args.where.id)||null;
      if(op==='count')return rows.length;
      if(op==='create'){const row={id:Math.max(...rows.map((r:any)=>r.id))+1,...args.data};rows.push(row);return row;}
      const idx=rows.findIndex((x:any)=>x.id===args.where.id);
      if(idx<0)throw Object.assign(new Error(),{code:'P2025'});
      if(op==='update'){rows[idx]={...rows[idx],...args.data};return rows[idx];}
      if((kind==='chefs'||kind==='ingredients')&&args.where.id===1)throw Object.assign(new Error(),{code:'P2003'});
      return rows.splice(idx,1)[0];
    };
  }
  p.dishIngredient.deleteMany=async(args:any)=>{calls.push({kind:'recipe',op:'deleteMany',args});return {count:1};};
  p.chefSpecialty.deleteMany=async(args:any)=>{calls.push({kind:'chef-specialty',op:'deleteMany',args});return {count:1};};
  p.$transaction=async(fn:any)=>fn(p);
});
after(async()=>{await new Promise<void>(resolve=>fakeStorage.close(()=>resolve()));await prisma.$disconnect();});
function token(html:string){return html.match(/name="_csrf" value="([a-f0-9]+)"/)![1];}
async function login(){const agent=request.agent(app);const r=await agent.get('/auth/login');const logged=await agent.post('/auth/login').type('form').send({_csrf:token(r.text),email:'admin@example.test',password:'test-password'});assert.equal(logged.status,303);assert.equal(logged.headers.location,'/admin/dishes');const list=await agent.get('/admin/chefs');return {agent,csrf:token(list.text)};}
test('real admin routes require login and valid CSRF',async()=>{
  assert.equal((await request(app).get('/admin/dishes')).headers.location,'/auth/login');
  const {agent}=await login();assert.equal((await agent.post('/admin/chefs').type('form').send({name:'Bad',specialty:'Bad'})).status,403);
});
test('authenticated admin forms render method overrides, deletion confirmation and missing-record responses',async()=>{
  const {agent}=await login();
  for(const kind of ['dishes','chefs','ingredients']){
    assert.equal((await agent.get(`/admin/${kind}`)).status,200);
    const add=await agent.get(`/admin/${kind}/new`);assert.equal(add.status,200);assert.match(add.text,/method="post"/);
    const edit=await agent.get(`/admin/${kind}/1/edit`);assert.equal(edit.status,200);assert.match(edit.text,/name="_method" value="PATCH"/);
    const del=await agent.get(`/admin/${kind}/1/delete`);assert.equal(del.status,200);assert.match(del.text,/Xác nhận xóa/);assert.match(del.text,/name="_method" value="DELETE"/);
  }
  for(const path of ['/admin/chefs/no/edit','/admin/ingredients/999/delete','/admin/unknown'])assert.equal((await agent.get(path)).status,404,path);
});
test('all entities reject invalid input with HTTP 400 and preserve submitted values',async()=>{
  const {agent,csrf}=await login();
  for(const kind of ['dishes','chefs','ingredients']){const r=await agent.post(`/admin/${kind}`).type('form').send({_csrf:csrf,name:'Nội dung đã nhập',price:'-2',description:'Giữ lại mô tả'});assert.equal(r.status,400,kind);assert.match(r.text,/Nội dung đã nhập/);if(kind==='dishes')assert.match(r.text,/Giữ lại mô tả/);}
});
test('chef and ingredient CRUD whitelist fields, use override, redirect 303 and guard foreign keys',async()=>{
  const {agent,csrf}=await login();
  for(const kind of ['chefs','ingredients']){
    const data=kind==='chefs'?{name:'Đầu bếp kiểm thử',specialty:'Món Việt',bio:'Giới thiệu'}:{name:'Nguyên liệu kiểm thử',unit:'g'};
    const create=await agent.post(`/admin/${kind}`).type('form').send({...data,_csrf:csrf,id:777,admin:true});assert.equal(create.status,303);
    const row=state[kind].at(-1);assert.notEqual(row.id,777);assert.equal(row.admin,undefined);
    const update=await agent.patch(`/admin/${kind}/${row.id}`).type('form').send({...data,name:'Đã sửa',_csrf:csrf});assert.equal(update.status,303);assert.equal(state[kind].at(-1).name,'Đã sửa');
    const blocked=await agent.post(`/admin/${kind}/1`).type('form').send({_csrf:csrf,_method:'DELETE'});assert.equal(blocked.status,400);assert.match(blocked.text,/đang được sử dụng/);
    const del=await agent.delete(`/admin/${kind}/${row.id}`).type('form').send({_csrf:csrf});assert.equal(del.status,303);assert.equal(state[kind].some((x:any)=>x.id===row.id),false);
  }
});
test('chef CRUD uses the shared specialty relation without writing a removed scalar column',async()=>{
  const {agent,csrf}=await login();
  const data={name:'Đầu bếp chuyên môn',specialty:'Món Việt, Món nướng',bio:'Giới thiệu'};
  assert.equal((await agent.post('/admin/chefs').type('form').send({...data,_csrf:csrf})).status,303);
  const row=state.chefs.at(-1);
  const created=[...calls].reverse().find(call=>call.kind==='chefs'&&call.op==='create');
  assert.equal(created?.args.data.specialty,undefined);
  assert.equal(created?.args.data.specialties.create.length,2);
  assert.equal((await agent.patch(`/admin/chefs/${row.id}`).type('form').send({...data,specialty:'Món Việt',_csrf:csrf})).status,303);
  assert.ok(calls.some(call=>call.kind==='chef-specialty'&&call.args.where.chefId===row.id));
  assert.equal((await agent.patch(`/admin/chefs/${row.id}`).type('form').send({...data,specialty:'x'.repeat(81),_csrf:csrf})).status,400);
  assert.equal((await agent.delete(`/admin/chefs/${row.id}`).type('form').send({_csrf:csrf})).status,303);
});

test('multipart dish edits transact recipe changes, reject fake image, GET never mutates',async()=>{
  const {agent,csrf}=await login();
  const data={name:'Bún bò kiểm thử',description:'Mô tả hợp lệ',price:'125000',category:'Món chính',chefId:'1',available:'on',qty_1:'150',qty_2:'180'};
  let r=agent.patch('/admin/dishes/1').field('_csrf',csrf);for(const[k,v]of Object.entries(data))r=r.field(k,v);
  const updated=await r;assert.equal(updated.status,303);const write=[...calls].reverse().find(x=>x.kind==='dishes'&&x.op==='update');assert.equal(write?.args.data.ingredients.create.length,2);assert.ok(calls.some(x=>x.kind==='recipe'));
  const bad=await agent.post('/admin/dishes/1').field('_csrf',csrf).field('_method','PATCH').field(data).attach('image',Buffer.from('fake image'),{filename:'fake.png',contentType:'image/png'});assert.equal(bad.status,400);assert.match(bad.text,/File ảnh không hợp lệ/);
  const before=calls.filter(x=>['create','update','delete','deleteMany'].includes(x.op)).length;
  assert.equal((await agent.get('/admin/dishes/2/delete?_method=DELETE')).status,200);
  assert.equal((await agent.get('/admin/dishes/2?_method=DELETE')).status,404);
  assert.equal(calls.filter(x=>['create','update','delete','deleteMany'].includes(x.op)).length,before);
  const del=await agent.post('/admin/dishes/2').type('form').send({_csrf:csrf,_method:'DELETE'});assert.equal(del.status,303);
});
test('missing IDs return 404 on PATCH and DELETE',async()=>{
  const{agent,csrf}=await login();for(const kind of ['dishes','chefs','ingredients'])for(const method of ['PATCH','DELETE'])assert.equal((await agent.post(`/admin/${kind}/99999`).type('form').send({_csrf:csrf,_method:method})).status,404);
});
test('dish creation uploads image on server and persists recipe with a storage object path',async()=>{
  const{agent,csrf}=await login();
  const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=','base64');
  const created=await agent.post('/admin/dishes').field('_csrf',csrf).field({name:'Món mới kiểm thử',description:'Mô tả món mới hợp lệ',price:'99000',category:'Món chính',chefId:'1',available:'on',qty_1:'150'}).attach('image',png,{filename:'dish.png',contentType:'image/png'});
  assert.equal(created.status,303);assert.ok(storageRequests.some(x=>x.startsWith('POST /storage/v1/object/')));
  const row=state.dishes.at(-1);assert.match(row.imagePath,/^uploads\/[a-f0-9]+\.png$/);assert.equal(row.ingredients.create[0].quantity,150);
  const deleted=await agent.post(`/admin/dishes/${row.id}`).type('form').send({_csrf:csrf,_method:'DELETE'});assert.equal(deleted.status,303);assert.ok(storageRequests.some(x=>x.startsWith('DELETE /storage/v1/object/')));
});
