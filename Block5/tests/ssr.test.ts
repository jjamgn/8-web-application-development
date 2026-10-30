import { test } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
process.env.DEMO_MODE='true';
const { app }=await import('../src/app.js');

test('SSR menu returns HTML, working detail links and pagination',async()=>{
  const r=await request(app).get('/dishes');assert.equal(r.status,200);assert.match(r.headers['content-type'],/html/);assert.match(r.text,/Bún bò nướng sả/);assert.match(r.text,/href="\/dishes\/1"/);assert.match(r.text,/Trang 1 \/ 2/);assert.doesNotMatch(r.text,/<script|fetch\(|XMLHttpRequest/);
  const next=await request(app).get('/dishes?page=2');assert.equal(next.status,200);assert.match(next.text,/Đậu hũ kho nấm/);assert.match(next.text,/Trang 2 \/ 2/);
});
test('search, category, availability, sort and empty states use server queries',async()=>{
  const r=await request(app).get('/dishes').query({q:'dừa',category:'Tráng miệng',available:'true',sort:'price-asc'});assert.equal(r.status,200);assert.match(r.text,/Panna cotta dừa xoài/);assert.match(r.text,/Xoài dừa nhiệt đới/);assert.match(r.text,/2 món ngon/);
  const empty=await request(app).get('/dishes?q=zzz-no-dish');assert.match(empty.text,/Chưa tìm thấy món/);
});
test('invalid and missing IDs return 404',async()=>{
  for(const path of ['/dishes/0','/dishes/-1','/dishes/abc','/dishes/9999','/dishes/1.5','/admin/chefs/no/edit','/admin/ingredients/999/delete','/admin/unknown']) assert.equal((await request(app).get(path)).status,404,path);
});
test('detail includes chef, ingredients and direct singular alias',async()=>{
  const r=await request(app).get('/dish/1');assert.equal(r.status,200);assert.match(r.text,/Nguyễn Minh An/);assert.match(r.text,/Thịt bò/);assert.match(r.text,/150 g/);
});
test('all admin forms render, use POST with method override and deletion confirmation',async()=>{
  for(const kind of ['dishes','chefs','ingredients']){
    assert.equal((await request(app).get(`/admin/${kind}`)).status,200);
    const add=await request(app).get(`/admin/${kind}/new`);assert.equal(add.status,200);assert.match(add.text,/method="post"/);
    const edit=await request(app).get(`/admin/${kind}/1/edit`);assert.equal(edit.status,200);assert.match(edit.text,/name="_method" value="PATCH"/);
    const del=await request(app).get(`/admin/${kind}/1/delete`);assert.equal(del.status,200);assert.match(del.text,/Xác nhận xóa/);assert.match(del.text,/name="_method" value="DELETE"/);
  }
});
test('demo never persists writes, including overridden requests',async()=>{
  for(const method of ['POST','PATCH','DELETE'])assert.equal((await request(app)[method.toLowerCase() as 'post']('/admin/dishes/1').send('name=Hacked&_method=DELETE')).status,503);
  assert.match((await request(app).get('/dishes/1')).text,/Bún bò nướng sả/);
});
test('CSRF rejects missing and malformed login tokens',async()=>{
  assert.equal((await request(app).post('/admin/login').send('email=a&password=b')).status,403);
  const agent=request.agent(app);await agent.get('/admin/login');
  assert.equal((await agent.post('/admin/login').send({_csrf:'é'.repeat(64)})).status,403);
});
test('queries are escaped in HTML and page numbers are bounded',async()=>{
  const r=await request(app).get('/dishes').query({q:'<script>alert(1)</script>',page:'-5'});assert.equal(r.status,200);assert.doesNotMatch(r.text,/<script>/);assert.match(r.text,/&lt;script&gt;/);
  assert.equal((await request(app).get('/dishes?page=99999999999999999999')).status,200);
});
