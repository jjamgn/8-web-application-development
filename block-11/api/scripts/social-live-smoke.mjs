// Explicit opt-in smoke for the dedicated Block 11 DB/bucket. Only its own fixtures are removed.
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import sharp from 'sharp';
import { randomUUID, createHash } from 'node:crypto';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';

if (process.env.BLOCK11_SOCIAL_LIVE !== '1') throw Error('Set BLOCK11_SOCIAL_LIVE=1 explicitly.');
if (!new URL(process.env.DATABASE_URL).username.includes('swuswowkpsffkrvvyblo')) throw Error('Unexpected project.');
const base = new URL(process.env.APP_ORIGIN).origin;
const db = new PrismaClient();
const runId = randomUUID(), password = randomUUID() + 'aA!';
const users = [], photos = new Set(), sessions = [];
const report = { runId, checks: [], cleaned: false };
const check = label => { report.checks.push(label); console.log('PASS ' + label); };
const snapshot = async () => db.photo.findMany({ select: { id:true,title:true,uploaderId:true,width:true,height:true,variants:{select:{id:true,sha256:true,chunkCount:true},orderBy:{id:'asc'}} },orderBy:{id:'asc'} });
const fingerprint = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const before = await snapshot();
function client() {
  let cookie = '', csrf = '';
  const call = async (route, method = 'GET', data, expected = 200, token = csrf) => {
    const headers = { Origin: base };
    if (cookie) headers.Cookie = cookie;
    if (method !== 'GET') headers['X-CSRF-Token'] = token;
    if (data && !(data instanceof FormData)) headers['Content-Type'] = 'application/json';
    const res = await fetch(base + route, { method, headers, body: data ? data instanceof FormData ? data : JSON.stringify(data) : undefined, signal: AbortSignal.timeout(60_000) });
    const cookies = res.headers.getSetCookie(); if (cookies.length) cookie = cookies[0].split(';')[0];
    const result = res.status === 204 ? null : res.headers.get('Content-Type')?.includes('application/json') ? await res.json() : Buffer.from(await res.arrayBuffer());
    assert.equal(res.status, expected, route + ': ' + (result?.error?.code ?? 'unexpected status'));
    if (result?.data?.csrfToken) csrf = result.data.csrfToken;
    return { data: result?.data ?? result, res };
  };
  const login = async user => { await call('/api/auth/csrf'); await call('/api/auth/login', 'POST', { email: user.email, password }); };
  return { call, login };
}
const a = client(), b = client(), guest = client();
const source = await readFile('../docs/demo-assets/exif-gps/test-sideways-orientation6-gps.jpg');
const multipart = (bytes = source, name = 'orientation.jpg') => {
  const form = new FormData(); form.append('photos', new Blob([bytes], { type: 'image/jpeg' }), name); form.append('metadata', JSON.stringify([{ title: 'Social smoke ' + runId, alt: 'Test orientation' }])); return form;
};
try {
  for (const label of ['A','B']) {
    const user = await db.user.create({ data: { name: 'Social smoke ' + label, email: 'block11-social-' + runId + '-' + label.toLowerCase() + '@example.test', passwordHash: await bcrypt.hash(password,12) } }); users.push(user);
  }
  await a.login(users[0]); await b.login(users[1]); sessions.push(a,b);
  await guest.call('/api/me/collections', 'GET', undefined, 401);
  await guest.call('/api/photos?favorites=true', 'GET', undefined, 401);
  await a.call('/api/me/profile', 'PATCH', { name: 'Wrong', bio: '' }, 403, 'wrong-token');
  const updated = (await a.call('/api/me/profile', 'PATCH', { name: 'Social smoke author', bio: 'Public bio' })).data;
  assert.equal(updated.bio, 'Public bio');
  const profile = (await guest.call('/api/users/' + users[0].id)).data;
  assert.equal(profile.name, 'Social smoke author'); assert.ok(!('email' in profile)); assert.ok(!('passwordHash' in profile));
  check('public profile and protected private mutations');
  const uploaded = (await a.call('/api/photos','POST',multipart())).data;
  assert.equal(uploaded.succeeded,1); const photo = uploaded.results[0].photo; photos.add(photo.id);
  assert.equal(photo.width,1000); assert.equal(photo.height,600);
  const search = (await guest.call('/api/photos?q=' + runId)).data;
  assert.equal(search.total,1); assert.equal(search.items[0].id,photo.id);
  const download = await guest.call(photo.variants.at(-1).url + '?download=1');
  assert.match(download.res.headers.get('Content-Disposition'), /^attachment/);
  const metadata = await sharp(download.data).metadata(); assert.equal(metadata.format,'webp'); assert.equal(metadata.exif,undefined);
  check('search and verified WebP download, EXIF removed');
  await b.call('/api/photos/' + photo.id + '/favorite','POST',undefined,204);
  await b.call('/api/photos/' + photo.id + '/favorite','POST',undefined,204);
  assert.deepEqual((await b.call('/api/photos/' + photo.id + '/activity')).data,{likes:1,liked:true});
  assert.equal((await b.call('/api/photos?favorites=true')).data.total,1);
  await b.call('/api/users/' + users[0].id + '/follow','POST',undefined,204);
  await b.call('/api/users/' + users[0].id + '/follow','POST',undefined,204);
  await b.call('/api/users/' + users[1].id + '/follow','POST',undefined,400);
  assert.equal((await b.call('/api/photos?following=true')).data.total,1);
  assert.equal((await b.call('/api/users/' + users[0].id)).data.isFollowing,true);
  check('idempotent favorites/follow and personalized feeds');
  const collection = (await b.call('/api/me/collections','POST',{title:'Private smoke'} ,201)).data;
  await b.call('/api/me/collections/' + collection.id + '/photos/' + photo.id,'POST',undefined,204);
  await b.call('/api/me/collections/' + collection.id + '/photos/' + photo.id,'POST',undefined,204);
  assert.equal((await b.call('/api/photos?collection=' + collection.id)).data.total,1);
  await a.call('/api/photos?collection=' + collection.id,'GET',undefined,404);
  await a.call('/api/me/collections/' + collection.id,'PATCH',{title:'Steal'},404);
  await a.call('/api/me/collections/' + collection.id + '/photos/' + photo.id,'DELETE',undefined,404);
  await b.call('/api/me/collections/' + collection.id,'PATCH',{title:'Renamed'},204);
  assert.equal((await b.call('/api/me/collections')).data.items[0].title,'Renamed');
  await b.call('/api/me/collections/' + collection.id,'DELETE',undefined,204);
  await guest.call('/api/photos/' + photo.id);
  check('private collections, owner checks, delete keeps source photo');
  const firstAvatar = (await a.call('/api/me/avatar','POST',multipart())).data;
  const oldId = firstAvatar.avatarUrl.split('/')[3]; photos.add(oldId);
  const firstBytes = (await guest.call(firstAvatar.avatarUrl)).data;
  const avatarInfo = await sharp(firstBytes).metadata(); assert.equal(avatarInfo.width,avatarInfo.height); assert.ok(avatarInfo.width <= 512); assert.equal(avatarInfo.exif,undefined);
  assert.equal((await guest.call('/api/photos?user=' + users[0].id)).data.total,1);
  assert.equal((await b.call('/api/photos?following=true')).data.total,1);
  await b.call('/api/photos/' + oldId + '/favorite','POST',undefined,404);
  await a.call('/api/me/avatar','POST',multipart(Buffer.from('not an image'),'bad.jpg'),400);
  assert.equal((await guest.call('/api/users/' + users[0].id)).data.avatarUrl,firstAvatar.avatarUrl);
  const secondAvatar = (await a.call('/api/me/avatar','POST',multipart())).data;
  photos.add(secondAvatar.avatarUrl.split('/')[3]); assert.notEqual(firstAvatar.avatarUrl,secondAvatar.avatarUrl);
  await guest.call(firstAvatar.avatarUrl,'GET',undefined,404);
  check('avatar orientation/crop/privacy, invalid input preserves avatar, replacement cleans old parts');
  await b.call('/api/photos/' + photo.id + '/favorite','DELETE',undefined,204);
  await b.call('/api/users/' + users[0].id + '/follow','DELETE',undefined,204);
  check('unfavorite and unfollow');
} finally {
  // Scope every cleanup to IDs created by this run.
  for (const user of users) {
    const rows = await db.photo.findMany({where:{uploaderId:user.id},select:{id:true}});
    for (const row of rows) {
      try { await (user.id === users[0]?.id ? a : b).call('/api/photos/' + row.id,'DELETE',undefined,204); photos.delete(row.id); } catch { /* Preserve rows for safe retry instead of deleting S3 manifests blindly. */ }
    }
  }
  for (const agent of sessions) { try { await agent.call('/api/auth/logout','POST',undefined,204); } catch {} }
  for (const user of users) if (!await db.photo.count({where:{uploaderId:user.id}})) await db.user.delete({where:{id:user.id}});
  const after = await snapshot(); report.cleaned = fingerprint(before) === fingerprint(after) && await db.user.count({where:{id:{in:users.map(u=>u.id)}}}) === 0;
  assert.equal(report.cleaned,true,'Fixture cleanup must preserve all original photos');
  await mkdir('../docs/evidence/social-profile',{recursive:true}); await writeFile('../docs/evidence/social-profile/live-results.json',JSON.stringify(report,null,2));
  await db.$disconnect();
}
