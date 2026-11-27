import { test } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import sharp from 'sharp';
import { readdir, mkdir, stat } from 'node:fs/promises';
import { createServer, request as httpRequest } from 'node:http';
import { once } from 'node:events';
import express from 'express';
import { randomUUID } from 'node:crypto';
import { testContext, padJpeg } from './helpers.js';
import { stageUpload, checkBodyBytes } from '../src/upload/parser.js';
import { LIMITS } from '../../contracts/index.js';
import { AppError } from '../src/errors.js';

type Context = Awaited<ReturnType<typeof testContext>>;
async function login(ctx: Context, address = `${randomUUID()}@example.com`) {
  const agent = request.agent(ctx.app);
  const csrf = (await agent.get('/api/auth/csrf')).body.data.csrfToken;
  const user = (await agent.post('/api/auth/register').set('Origin',ctx.config.APP_ORIGIN).set('X-CSRF-Token',csrf)
    .send({ name:'Người upload', email:address, password:'password123',confirmPassword:'password123' }).expect(201)).body.data.user;
  const logged = await agent.post('/api/auth/login').set('Origin',ctx.config.APP_ORIGIN).set('X-CSRF-Token',csrf)
    .send({email:address,password:'password123'}).expect(200);
  const token = logged.body.data.csrfToken;
  return { agent, user, token, upload: () => agent.post('/api/photos').set('Origin',ctx.config.APP_ORIGIN).set('X-CSRF-Token',token) };
}
const jpeg = () => sharp({create:{width:400,height:200,channels:3,background:'#123456'}}).jpeg().toBuffer();
const metadata = (count: number) => JSON.stringify(Array.from({length:count},(_,i)=>({title:`Ảnh ${i}`,alt:`Mô tả ${i}`})));
async function assertClean(ctx: Context) { assert.deepEqual(await readdir(ctx.config.UPLOAD_TMP_DIR),[]); }

test('mixed JPEG/PNG/fake/truncated: ordered per-file outcomes; metadata may arrive after files', async t => {
  const ctx = await testContext(); t.after(ctx.dispose); const auth = await login(ctx);
  const good = await jpeg(); const png = await sharp(good).png().toBuffer();
  const res = await auth.upload().attach('photos',good,'misleading.txt').attach('photos',Buffer.from('fake'),'fake.jpg')
    .attach('photos',png,'alpha.png').attach('photos',good.subarray(0,good.length-40),'truncated.jpg').field('metadata',metadata(4)).expect(200);
  assert.deepEqual(res.body.data.results.map((r: {index:number;ok:boolean})=>[r.index,r.ok]),[[0,true],[1,false],[2,true],[3,false]]);
  assert.equal(res.body.data.succeeded,2); assert.equal(res.body.data.failed,2); assert.equal(ctx.photos.rows.size,2);
  assert.equal(res.body.data.results[0].photo.uploader.id,auth.user.id);
  assert.deepEqual(Object.keys(res.body.data.results[0].photo.uploader).sort(),['avatarUrl','id','name']);
  assert.equal(res.body.data.results[1].error.code,'UNSUPPORTED_IMAGE_TYPE');
  assert.equal(res.body.data.results[3].error.code,'INVALID_IMAGE');
  await assertClean(ctx);
});

test('exact 10 MiB JPEG succeeds; 10 MiB+1 fails individually, next valid file still publishes', async t => {
  const ctx = await testContext(); t.after(ctx.dispose); const auth = await login(ctx); const good = await jpeg();
  const res = await auth.upload().field('metadata',metadata(3)).attach('photos',padJpeg(good,LIMITS.fileBytes),'exact.jpg')
    .attach('photos',padJpeg(good,LIMITS.fileBytes+1),'over.jpg').attach('photos',good,'good.jpg').expect(200);
  assert.equal(res.body.data.results[0].ok,true); assert.equal(res.body.data.results[1].error.code,'FILE_TOO_LARGE');
  assert.equal(res.body.data.results[2].ok,true); assert.equal(ctx.photos.rows.size,2); await assertClean(ctx);
});

test('structural failures never invoke publisher and always remove staging', async t => {
  const ctx = await testContext(); t.after(ctx.dispose); const auth = await login(ctx); const good=await jpeg();
  const cases = [
    () => auth.upload().field('metadata','[]'),
    () => { let req=auth.upload().field('metadata',metadata(6)); for(let i=0;i<6;i++) req=req.attach('photos',good,`${i}.jpg`); return req; },
    () => auth.upload().field('metadata','not json').attach('photos',good,'x.jpg'),
    () => auth.upload().field('metadata',metadata(2)).attach('photos',good,'x.jpg'),
    () => auth.upload().field('metadata',metadata(1)).field('metadata',metadata(1)).attach('photos',good,'x.jpg'),
    () => auth.upload().field('metadata',metadata(1)).field('uploaderId',auth.user.id).attach('photos',good,'x.jpg'),
    () => auth.upload().field('metadata',metadata(1)).attach('wrongName',good,'x.jpg'),
    () => auth.upload().field('metadata',JSON.stringify([{title:'x',alt:'y',uploaderId:auth.user.id}])).attach('photos',good,'x.jpg'),
    () => auth.upload().field('metadata',JSON.stringify([{title:' ',alt:'y'}])).attach('photos',good,'x.jpg'),
    () => auth.upload().field('metadata',JSON.stringify([{title:'😀'.repeat(121),alt:'y'}])).attach('photos',good,'x.jpg'),
    () => auth.upload().field('metadata','x'.repeat(LIMITS.metadataBytes+1)).attach('photos',good,'x.jpg')
  ];
  for(const perform of cases) {
    const res = await perform().expect(400); assert.equal(res.body.ok,false);
    assert.equal(ctx.photos.prepared.length,0); await assertClean(ctx);
  }
  const malformed = `--test\r\nContent-Disposition: form-data; name="photos"; filename="x.jpg"\r\nContent-Type: image/jpeg\r\n\r\n`;
  await auth.upload().set('Content-Type','multipart/form-data; boundary=test').send(Buffer.concat([Buffer.from(malformed),good])).expect(400);
  assert.equal(ctx.photos.prepared.length,0); await assertClean(ctx);
  await auth.upload().set('Content-Type','multipart/form-data').send('no boundary').expect(400);
  await auth.upload().send({photos:'wrong content type'}).expect(415);
});

test('Unicode limits count code points; metadata is capped inclusively at 16 KiB', async t => {
  const ctx=await testContext(); t.after(ctx.dispose); const auth=await login(ctx); const good=await jpeg();
  const item=JSON.stringify([{title:'😀'.repeat(120),alt:'😀'.repeat(300)}]);
  const padded=item+' '.repeat(LIMITS.metadataBytes-Buffer.byteLength(item));
  assert.equal(Buffer.byteLength(padded),LIMITS.metadataBytes);
  await auth.upload().field('metadata',padded).attach('photos',good,'ok.jpg').expect(200);
  await auth.upload().field('metadata',padded+' ').attach('photos',good,'over.jpg').expect(400);
  assert.equal(ctx.photos.rows.size,1); await assertClean(ctx);
});

test('auth recheck after multipart rejects logout/expiry before publishing; CSRF guard precedes disk', async t => {
  const ctx=await testContext(); t.after(ctx.dispose); const auth=await login(ctx); const good=await jpeg();
  await auth.agent.post('/api/photos').set('Origin','https://attacker.example').set('X-CSRF-Token',auth.token)
    .attach('photos',good,'ok.jpg').field('metadata',metadata(1)).expect(403);
  const originalRead=ctx.sessions.read.bind(ctx.sessions); let reads=0;
  ctx.sessions.read=async sid => {
    reads++;
    // middleware get → initial guard → recheck after full staging
    if(reads===3) await ctx.sessions.destroy(sid);
    return originalRead(sid);
  };
  await auth.upload().field('metadata',metadata(1)).attach('photos',good,'ok.jpg').expect(401);
  assert.equal(ctx.photos.prepared.length,0); await assertClean(ctx);
});

test('service failure is a file result and does not prevent later publishing; all-invalid response is still 200', async t => {
  const ctx=await testContext(); t.after(ctx.dispose); const auth=await login(ctx); const good=await jpeg();
  ctx.photos.failNext=true;
  const failed=await auth.upload().field('metadata',metadata(2)).attach('photos',good,'db-fault.jpg').attach('photos',good,'good.jpg').expect(200);
  assert.equal(failed.body.data.results[0].error.code,'PHOTO_SAVE_FAILED'); assert.equal(failed.body.data.results[1].ok,true);
  const invalid=await auth.upload().field('metadata',metadata(1)).attach('photos',Buffer.from('text'),'fake.jpg').expect(200);
  assert.equal(invalid.body.ok,true); assert.equal(invalid.body.data.succeeded,0); assert.equal(invalid.body.data.failed,1);
  await assertClean(ctx);
});

test('list query/UUID/status contract and authenticated owner deletion delegated to A', async t => {
  const ctx=await testContext(); t.after(ctx.dispose); const owner=await login(ctx); const other=await login(ctx); const good=await jpeg();
  const upload=await owner.upload().field('metadata',metadata(1)).attach('photos',good,'ok.jpg').expect(200);
  const id=upload.body.data.results[0].photo.id;
  for(const query of ['?page=0','?page=-1','?page=1.5','?page=bad','?page=1&page=2','?pageSize=99'])
    await request(ctx.app).get(`/api/photos${query}`).expect(400);
  await request(ctx.app).get('/api/photos/not-a-uuid').expect(404);
  const page=await request(ctx.app).get('/api/photos?page=99').expect(200); assert.deepEqual(page.body.data.items,[]);
  await request(ctx.app).delete(`/api/photos/${id}`).expect(401);
  await other.agent.delete(`/api/photos/${id}`).set('Origin',ctx.config.APP_ORIGIN).set('X-CSRF-Token',other.token).expect(403);
  assert.equal(ctx.photos.rows.size,1);
  ctx.photos.deletePending=true;
  const pending=await owner.agent.delete(`/api/photos/${id}`).set('Origin',ctx.config.APP_ORIGIN).set('X-CSRF-Token',owner.token).expect(202);
  assert.equal(pending.body.data.status,'DELETING');
  await request(ctx.app).get(`/api/photos/${id}`).expect(404);
  const next=await owner.upload().field('metadata',metadata(1)).attach('photos',good,'ok.jpg').expect(200);
  ctx.photos.deletePending=false;
  await owner.agent.delete(`/api/photos/${next.body.data.results[0].photo.id}`).set('Origin',ctx.config.APP_ORIGIN).set('X-CSRF-Token',owner.token).expect(204);
});

test('body byte counter includes exact 55 MiB and rejects 55 MiB+1', () => {
  assert.doesNotThrow(()=>checkBodyBytes(LIMITS.bodyBytes));
  assert.throws(()=>checkBodyBytes(LIMITS.bodyBytes+1),{code:'REQUEST_TOO_LARGE'});
});

test('five files are accepted without truncation',async t=>{
  const ctx=await testContext();t.after(ctx.dispose);const auth=await login(ctx);const good=await jpeg();
  let req=auth.upload().field('metadata',metadata(5));
  for(let i=0;i<5;i++)req=req.attach('photos',good,`${i}.jpg`);
  const result=await req.expect(200);assert.equal(result.body.data.succeeded,5);await assertClean(ctx);
});

test('client abort during multipart cannot publish and removes partial staging',async t=>{
  const ctx=await testContext();t.after(ctx.dispose);await mkdir(ctx.config.UPLOAD_TMP_DIR,{recursive:true});
  let finish!:()=>void;
  const finished=new Promise<void>(resolve=>{finish=resolve;});
  const app=express();let published=false;
  app.post('/',async(req,res)=>{
    try{const staged=await stageUpload(req,ctx.config.UPLOAD_TMP_DIR);published=true;await staged.dispose();res.end();}
    catch{}finally{finish();}
  });
  const server=createServer(app);server.listen(0,'127.0.0.1');await once(server,'listening');
  t.after(()=>new Promise<void>(resolve=>{server.closeAllConnections();server.close(()=>resolve());}));
  const address=server.address();assert.ok(address&&typeof address==='object');
  const req=httpRequest({hostname:'127.0.0.1',port:address.port,method:'POST',headers:{'Content-Type':'multipart/form-data; boundary=abort-test'}});
  req.on('error',()=>{});
  req.write('--abort-test\r\nContent-Disposition: form-data; name="photos"; filename="x.jpg"\r\nContent-Type: image/jpeg\r\n\r\n');
  req.write(Buffer.alloc(256*1024));
  // Wait until receiving has started, then disconnect without a closing boundary.
  for(let i=0;i<100&&(await readdir(ctx.config.UPLOAD_TMP_DIR)).length===0;i++)await new Promise(resolve=>setTimeout(resolve,5));
  req.destroy();await finished;assert.equal(published,false);await assertClean(ctx);
});

for(const contentLength of [false,true]) for(const over of [false,true])
test(`real streaming multipart ${over?'55 MiB+1':'55 MiB'} (${contentLength?'Content-Length':'chunked'})`, async t => {
  const ctx=await testContext(); t.after(ctx.dispose); await mkdir(ctx.config.UPLOAD_TMP_DIR,{recursive:true});
  const app=express();
  app.post('/',async(req,res,next)=>{
    try { const staged=await stageUpload(req,ctx.config.UPLOAD_TMP_DIR);
      const sizes=await Promise.all(staged.files.map(f=>stat(f.tempPath).then(s=>s.size)));
      const codes=staged.files.map(f=>f.error?.code); await staged.dispose(); res.json({sizes,codes});
    } catch(error) { next(error); }
  });
  app.use((error:unknown,_req:express.Request,res:express.Response,_next:express.NextFunction)=>{
    res.status(error instanceof AppError?error.status:500).json({code:error instanceof AppError?error.code:'INTERNAL_ERROR'});
  });
  const server=createServer(app); server.listen(0,'127.0.0.1'); await once(server,'listening');
  t.after(()=>new Promise<void>(resolve=>{server.closeAllConnections();server.close(()=>resolve());}));
  const address=server.address(); assert.ok(address&&typeof address==='object');
  const start=Buffer.from('--boundary\r\nContent-Disposition: form-data; name="photos"; filename="x.jpg"\r\nContent-Type: image/jpeg\r\n\r\n');
  const end=Buffer.from(`\r\n--boundary\r\nContent-Disposition: form-data; name="metadata"\r\n\r\n${metadata(1)}\r\n--boundary--\r\n`);
  const total=LIMITS.bodyBytes+(over?1:0);
  const headers:Record<string,string|number>={'Content-Type':'multipart/form-data; boundary=boundary'};
  if(contentLength)headers['Content-Length']=total;
  const req=httpRequest({hostname:'127.0.0.1',port:address.port,path:'/',method:'POST',headers});
  const response=new Promise<{status:number;body:{codes?:string[];sizes?:number[];code?:string}}>((resolve,reject)=>{
    req.on('error',reject); req.on('response',res=>{const chunks:Buffer[]=[];res.on('data',chunk=>chunks.push(chunk));res.on('end',()=>resolve({status:res.statusCode!,body:JSON.parse(Buffer.concat(chunks).toString())}));});
  });
  // Send the header-only oversize case without transmitting a body the server has rejected.
  if(contentLength&&over) { req.end(); }
  else {
    req.write(start); let remaining=total-start.length-end.length; const chunk=Buffer.alloc(256*1024);
    while(remaining>0){const size=Math.min(remaining,chunk.length);if(!req.write(chunk.subarray(0,size)))await once(req,'drain');remaining-=size;}
    req.end(end);
  }
  const result=await response;
  assert.equal(result.status,over?413:200);
  if(over)assert.equal(result.body.code,'REQUEST_TOO_LARGE');
  else {assert.deepEqual(result.body.codes,['FILE_TOO_LARGE']);assert.ok(result.body.sizes![0]!<=LIMITS.fileBytes);}
  await assertClean(ctx);
});
