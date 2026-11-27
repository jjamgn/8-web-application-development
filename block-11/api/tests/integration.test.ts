import { test } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import sharp from 'sharp';
import { randomBytes, randomUUID } from 'node:crypto';
import { readdir } from 'node:fs/promises';
import type { PrismaClient } from '@prisma/client';
import type { SessionData } from 'express-session';
import { createApp } from '../src/app.js';
import { PhotoService } from '../src/services/photo-service.js';
import { createMediaRouter } from '../src/routes/media.js';
import { PrismaUserRepository, PrismaSessionRepository } from '../src/repositories/user-session-repository.js';
import { adaptAuthRepositories } from '../src/config/dependencies.js';
import { MemoryRepository, MemoryStorage } from './role-a/fakes.js';
import { testContext } from './helpers.js';

// Actual B HTTP/parser/sharp -> actual A PhotoService/chunker/media router.
// Only persistence/S3 are controlled test doubles; this is not live infrastructure evidence.
test('A+B HTTP: multipart → WebP → multi-part manifest → public verified media → owner-only delete', async t => {
  const ctx=await testContext();t.after(ctx.dispose);
  const repository=new MemoryRepository(),storage=new MemoryStorage();
  const photos=new PhotoService(repository,storage,{tempRoot:ctx.config.UPLOAD_TMP_DIR});
  const app=createApp(ctx.config,{users:ctx.users,sessions:ctx.sessions,photos,mediaRouter:createMediaRouter(photos)});
  const authenticate=async()=>{
    const agent=request.agent(app);let token=(await agent.get('/api/auth/csrf')).body.data.csrfToken;
    const email=`${randomUUID()}@example.com`;
    const created=await agent.post('/api/auth/register').set('Origin',ctx.config.APP_ORIGIN).set('X-CSRF-Token',token)
      .send({name:'Integration',email,password:'password123',confirmPassword:'password123'}).expect(201);
    const logged=await agent.post('/api/auth/login').set('Origin',ctx.config.APP_ORIGIN).set('X-CSRF-Token',token)
      .send({email,password:'password123'}).expect(200);token=logged.body.data.csrfToken;
    return{agent,token,user:created.body.data.user};
  };
  const owner=await authenticate(),other=await authenticate();
  const noise=await sharp(randomBytes(1600*1600*3),{raw:{width:1600,height:1600,channels:3}}).png().toBuffer();
  assert.ok(noise.length<=10_485_760);
  const upload=await owner.agent.post('/api/photos').set('Origin',ctx.config.APP_ORIGIN).set('X-CSRF-Token',owner.token)
    .attach('photos',noise,'noise.png').attach('photos',Buffer.from('fake image'),'fake.jpg')
    .field('metadata',JSON.stringify([{title:'Large WebP',alt:'Synthetic random pixels'},{title:'Fake',alt:'Rejected text'}])).expect(200);
  assert.equal(upload.body.data.succeeded,1);assert.equal(upload.body.data.failed,1);
  const photo=upload.body.data.results[0].photo;assert.equal(photo.uploader.id,owner.user.id);
  const stored=repository.photos.get(photo.id)!;
  const largest=stored.variants.find(variant=>variant.width===1600)!;
  assert.ok(largest.bytes>1_048_576);assert.ok(largest.chunkCount>1);
  assert.equal(storage.objects.size,stored.variants.reduce((sum,variant)=>sum+variant.chunkCount,0));
  assert.ok([...storage.objects.keys()].every(key=>key.endsWith('.part')));
  const detail=await request(app).get(`/api/photos/${photo.id}`).expect(200);assert.equal(detail.headers['set-cookie'],undefined);
  const media=await request(app).get(`/media/photos/${photo.id}/1600.webp`).buffer(true).parse((res,callback)=>{
    const chunks:Buffer[]=[];res.on('data',chunk=>chunks.push(Buffer.from(chunk)));res.on('end',()=>callback(null,Buffer.concat(chunks)));
  }).expect(200).expect('Content-Type','image/webp').expect('Cache-Control','public, max-age=31536000, immutable');
  assert.equal(media.headers['set-cookie'],undefined);assert.equal(media.body.length,largest.bytes);
  assert.equal((await sharp(media.body).metadata()).width,1600);
  await request(app).get('/api/photos?page=2147483647').expect(400);
  await other.agent.delete(`/api/photos/${photo.id}`).set('Origin',ctx.config.APP_ORIGIN).set('X-CSRF-Token',other.token).expect(403);
  assert.equal(repository.photos.size,1);
  await owner.agent.delete(`/api/photos/${photo.id}`).set('Origin',ctx.config.APP_ORIGIN).set('X-CSRF-Token',owner.token).expect(204);
  assert.equal(repository.photos.size,0);assert.equal(storage.objects.size,0);
  await request(app).get(`/media/photos/${photo.id}/1600.webp`).expect(404);
  for(let i=0;i<100&&(await readdir(ctx.config.UPLOAD_TMP_DIR)).length;i++)await new Promise(resolve=>setTimeout(resolve,5));
  assert.deepEqual(await readdir(ctx.config.UPLOAD_TMP_DIR),[]);
});

test('A Prisma repository adapters preserve absolute expiry, JSON cookie data and logout tombstone behavior', async () => {
  const rows=new Map<string, {sid:string;userId:string|null;data:unknown;expiresAt:Date}>();
  const userId=randomUUID();
  const db={
    user:{
      async findUnique({where,select}:{where:{email?:string;id?:string};select:{passwordHash?:boolean}}){
        if(where.email!=='test@example.com'&&where.id!==userId)return null;
        return{id:userId,name:'Test',...(select.passwordHash?{passwordHash:'server-only-hash'}:{})};
      },
      async create({data}:{data:{name:string;email:string;passwordHash:string}}){return{id:userId,name:data.name};}
    },
    session:{
      async create({data}:{data:{sid:string;userId:string|null;data:unknown;expiresAt:Date}}){rows.set(data.sid,structuredClone(data));},
      async findFirst({where}:{where:{sid:string;expiresAt:{gt:Date}}}){const row=rows.get(where.sid);return row&&row.expiresAt>where.expiresAt.gt?structuredClone(row):null;},
      async updateMany({where,data}:{where:{sid:string;expiresAt:{gt:Date}};data:{data:unknown;userId:string|null}}){
        const row=rows.get(where.sid);if(!row||row.expiresAt<=where.expiresAt.gt)return{count:0};Object.assign(row,data);return{count:1};
      },
      async deleteMany({where}:{where:{sid:string}}){return{count:rows.delete(where.sid)?1:0};}
    }
  } as unknown as PrismaClient;
  const {users,sessions}=adaptAuthRepositories(new PrismaUserRepository(db),new PrismaSessionRepository(db));
  assert.equal((await users.byEmail(' TEST@Example.com '))!.passwordHash,'server-only-hash');
  assert.deepEqual(await users.byId(userId),{id:userId,name:'Test'});
  const expiresAt=new Date(Date.now()+3_600_000);
  const data={cookie:{originalMaxAge:3_600_000,expires:expiresAt,httpOnly:true,path:'/',sameSite:'lax'},
    userId,csrfToken:'a'.repeat(64),absoluteExpiresAt:expiresAt.getTime()} as SessionData;
  await sessions.create({sid:'new-sid',userId,data,expiresAt});
  assert.equal((await sessions.read('new-sid'))!.data.userId,userId);
  assert.equal(await sessions.updateActive('new-sid',{...data,csrfToken:'b'.repeat(64)},userId),true);
  assert.equal(rows.get('new-sid')!.expiresAt.getTime(),expiresAt.getTime());
  await sessions.destroy('new-sid');
  assert.equal(await sessions.updateActive('new-sid',data,userId),false);assert.equal(await sessions.read('new-sid'),null);
  rows.set('corrupt',{sid:'corrupt',userId,data:{cookie:null},expiresAt});assert.equal(await sessions.read('corrupt'),null);
});
