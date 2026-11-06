import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import bcrypt from 'bcryptjs';
import {createServer} from 'node:http';
import { chefs,ingredients,dishes } from '../src/data.js';
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
  p.$transaction=async(fn:any)=>fn(p);
});
after(async()=>{await new Promise<void>(resolve=>fakeStorage.close(()=>resolve()));await prisma.$disconnect();});
function token(html:string){return html.match(/name="_csrf" value="([a-f0-9]+)"/)![1];}
async function login(){const agent=request.agent(app);const r=await agent.get('/admin/login');const logged=await agent.post('/admin/login').type('form').send({_csrf:token(r.text),email:'admin@example.test',password:'test-password'});assert.equal(logged.status,303);const list=await agent.get('/admin/chefs');return {agent,csrf:token(list.text)};}
test('real admin routes require login and valid CSRF',async()=>{
  assert.equal((await request(app).get('/admin/dishes')).status,303);
  const {agent}=await login();assert.equal((await agent.post('/admin/chefs').type('form').send({name:'Bad',specialty:'Bad'})).status,403);
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
