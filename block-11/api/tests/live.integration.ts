import 'dotenv/config';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import { randomUUID } from 'node:crypto';

// Opt-in HTTP integration against the combined A+B backend and REAL DB/SeaweedFS.
// This test never substitutes a repository/service. Use a dedicated disposable test database.
const base = process.env.BLOCK11_LIVE_BASE_URL;
const origin = process.env.APP_ORIGIN;
if (!base || !origin) throw new Error('Set BLOCK11_LIVE_BASE_URL and APP_ORIGIN for the running A+B test instance.');
const baseUrl = new URL(base);
if (!['http:', 'https:'].includes(baseUrl.protocol)) throw new Error('Invalid live test URL');

test('A+B live HTTP: auth, mixed upload, public media, session identity and owner delete', async () => {
  let cookie = '', token = '';
  const call = async (route:string, options:RequestInit = {}, authenticated = true) => {
    const headers = new Headers(options.headers);
    if(authenticated && cookie)headers.set('Cookie',cookie);
    if(options.method && options.method !== 'GET') {headers.set('Origin',origin!);headers.set('X-CSRF-Token',token);}
    const response = await fetch(new URL(route,baseUrl), { ...options, headers, redirect:'manual' });
    if(authenticated) {
      const value = response.headers.getSetCookie().find(value=>value.startsWith('block11.sid='));
      if(value)cookie=value.split(';')[0]!;
    }
    return response;
  };
  const csrf = await call('/api/auth/csrf'); assert.equal(csrf.status,200); token=(await csrf.json()).data.csrfToken;
  const email=`block11-b-live-${randomUUID()}@example.com`, password=`Test-${randomUUID()}`;
  const registration = await call('/api/auth/register',{method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({name:'Role B live test',email,password,confirmPassword:password})});
  assert.equal(registration.status,201);
  const user=(await registration.json()).data.user;
  const login=await call('/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email,password})});
  assert.equal(login.status,200);token=(await login.json()).data.csrfToken;
  const image=await sharp({create:{width:800,height:400,channels:4,background:{r:24,g:130,b:140,alpha:0.4}}}).png().toBuffer();
  const form=new FormData();form.append('photos',new Blob([new Uint8Array(image)],{type:'image/png'}),'live.png');
  form.append('photos',new Blob(['text masquerading as JPEG'],{type:'image/jpeg'}),'fake.jpg');
  form.append('metadata',JSON.stringify([{title:'Live B',alt:'PNG trong suốt giả lập'},{title:'Fake',alt:'File không hợp lệ'}]));
  const upload=await call('/api/photos',{method:'POST',body:form});assert.equal(upload.status,200);
  const data=(await upload.json()).data;
  assert.equal(data.succeeded,1);assert.equal(data.failed,1);assert.equal(data.results[1].error.code,'UNSUPPORTED_IMAGE_TYPE');
  const photo=data.results[0].photo;assert.equal(photo.uploader.id,user.id);assert.deepEqual(Object.keys(photo.uploader).sort(),['id','name']);
  try {
    assert.equal((await call(`/api/photos/${photo.id}`,{},false)).status,200);
    const media=await call(photo.variants[0].url,{},false);assert.equal(media.status,200);
    assert.equal(media.headers.get('Content-Type'),'image/webp');
    assert.equal(media.headers.get('Cache-Control'),'public, max-age=31536000, immutable');
    const decoded=await sharp(Buffer.from(await media.arrayBuffer())).metadata();assert.equal(decoded.format,'webp');
    assert.equal(decoded.exif,undefined);
    assert.equal((await call(`/api/photos/${photo.id}`,{method:'DELETE'},false)).status,401);
    const removed=await call(`/api/photos/${photo.id}`,{method:'DELETE'});assert.equal(removed.status,204);
    assert.equal((await call(`/api/photos/${photo.id}`,{},false)).status,404);
    assert.equal((await call(photo.variants[0].url,{headers:{'Cache-Control':'no-cache'}},false)).status,404);
  } finally {
    // Best-effort removal if a preceding assertion failed. Keep cleanup failure visible in logs.
    const cleanup=await call(`/api/photos/${photo.id}`,{method:'DELETE'});
    assert.ok([204,404].includes(cleanup.status),`Live test cleanup returned ${cleanup.status}`);
    assert.equal((await call('/api/auth/logout',{method:'POST'})).status,204);
    assert.equal((await call('/api/auth/me')).status,401);
  }
});
