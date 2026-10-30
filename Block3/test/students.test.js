const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { once } = require('node:events');
const { createStudentStore, ValidationError } = require('../services/studentService');
const { createApp } = require('../app');

function student(index, extra = {}) {
  return { studentCode: `SV${index}`, name: `Sinh viên ${index}`, email: `sv${index}@example.com`, className: 'CNTT01', ...extra };
}

async function fixture(t) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'student-ssr-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const dataFile = path.join(directory, 'data', 'students.json');
  const store = createStudentStore(dataFile);
  await store.initialize();
  return { directory, dataFile, store };
}

test('initializes a missing file and preserves an existing student on restart', async t => {
  const { dataFile, store } = await fixture(t);
  assert.deepEqual(await store.list(), []);
  const added = await store.add(student(1));
  assert.ok(added.id);
  const restarted = createStudentStore(dataFile);
  await restarted.initialize();
  assert.deepEqual(await restarted.list(), [added]);
});

test('concurrent additions keep every student and clean up temporary files', async t => {
  const { dataFile, store } = await fixture(t);
  await Promise.all(Array.from({ length: 20 }, (_, index) => store.add(student(index))));
  const students = JSON.parse(await fs.readFile(dataFile, 'utf8'));
  assert.equal(students.length, 20);
  assert.equal(new Set(students.map(item => item.id)).size, 20);
  assert.deepEqual(await fs.readdir(path.dirname(dataFile)), ['students.json']);
});

test('duplicate checks run inside the queue, normalize input, and recover after errors', async t => {
  const { store } = await fixture(t);
  const results = await Promise.allSettled([
    store.add(student(1, { studentCode: ' sv01 ', email: ' HELLO@EXAMPLE.COM ', name: ' An ' })),
    store.add(student(2, { studentCode: 'SV01', email: 'hello@example.com' }))
  ]);
  assert.equal(results[0].status, 'fulfilled');
  assert.equal(results[0].value.name, 'An');
  assert.equal(results[0].value.email, 'hello@example.com');
  assert.equal(results[1].status, 'rejected');
  assert.ok(results[1].reason instanceof ValidationError);
  assert.ok(results[1].reason.errors.studentCode);
  assert.ok(results[1].reason.errors.email);
  await store.add(student(3));
  assert.equal((await store.list()).length, 2);
});

test('invalid input is rejected without changing the file', async t => {
  const { dataFile, store } = await fixture(t);
  const original = await fs.readFile(dataFile, 'utf8');
  await assert.rejects(store.add({ studentCode: ['SV01'], name: ' ', email: 'invalid', className: '' }), error => {
    assert.ok(error instanceof ValidationError);
    assert.equal(Object.keys(error.errors).length, 4);
    return true;
  });
  assert.equal(await fs.readFile(dataFile, 'utf8'), original);
});

test('corrupt JSON and invalid records are never overwritten', async t => {
  const { dataFile, store } = await fixture(t);
  for (const contents of ['{broken', '{}', '[null]', JSON.stringify([{ id: 'x', ...student(1) }, { id: 'x', ...student(2) }])]) {
    await fs.writeFile(dataFile, contents);
    await assert.rejects(store.initialize());
    await assert.rejects(store.add(student(3)));
    assert.equal(await fs.readFile(dataFile, 'utf8'), contents);
  }
});

test('SSR filters by exact class code, normalizes case, handles no matches and escapes query values', async t => {
  const { dataFile, store } = await fixture(t);
  await store.add(student(1, { name: 'Sinh viên lớp một', className: ' cntt01 ' }));
  await store.add(student(2, { name: 'Sinh viên lớp hai', className: 'CNTT02' }));
  await store.add(student(3, { name: 'Sinh viên cùng lớp', className: 'CNTT01' }));
  const original = await fs.readFile(dataFile, 'utf8');
  const { app } = createApp({ dataFile });
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise((resolve, reject) => {
    server.close(error => error ? reject(error) : resolve());
    server.closeAllConnections();
  }));
  const base = `http://127.0.0.1:${server.address().port}`;
  const response = await fetch(`${base}/students?className=%20cntt01%20`);
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /Sinh viên lớp CNTT01/);
  assert.match(html, /Sinh viên lớp một/);
  assert.match(html, /Sinh viên cùng lớp/);
  assert.ok(!html.includes('Sinh viên lớp hai'));
  assert.match(html, /value="CNTT01" selected/);
  assert.match(html, /value="CNTT02"/);
  assert.match(html, /Hiển thị 2 sinh viên/);
  assert.match(html, /Tổng sinh viên<\/span><strong>3<\/strong>/);
  assert.match(html, /Số lớp<\/span><strong>2<\/strong>/);
  for (const code of ['CNTT', 'UNKNOWN']) {
    const empty = await fetch(`${base}/students?className=${code}`);
    assert.equal(empty.status, 200);
    const emptyHtml = await empty.text();
    assert.match(emptyHtml, /Không có sinh viên trong lớp này/);
    assert.ok(!emptyHtml.includes('Sinh viên lớp một'));
    assert.match(emptyHtml, /0 sinh viên/);
  }
  const all = await fetch(`${base}/students?className=`);
  const allHtml = await all.text();
  assert.match(allHtml, /Sinh viên lớp một/);
  assert.match(allHtml, /Sinh viên lớp hai/);
  assert.match(allHtml, /Sinh viên cùng lớp/);
  const unsafe = '<script>alert(1)</script>';
  const escaped = await fetch(`${base}/students?className=${encodeURIComponent(unsafe)}`);
  const escapedHtml = await escaped.text();
  assert.ok(!escapedHtml.includes('<SCRIPT>'));
  assert.match(escapedHtml, /&lt;SCRIPT&gt;/);
  assert.equal(await fs.readFile(dataFile, 'utf8'), original);
});

test('SSR routes render, persist, redirect, retain invalid values and escape HTML', async t => {
  const { dataFile } = await fixture(t);
  const { app } = createApp({ dataFile, logger: { error() {} } });
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise((resolve, reject) => {
    server.close(error => error ? reject(error) : resolve());
    server.closeAllConnections();
  }));
  const base = `http://127.0.0.1:${server.address().port}`;
  const post = values => fetch(`${base}/students`, {
    method: 'POST', body: new URLSearchParams(values), redirect: 'manual'
  });

  const root = await fetch(base, { redirect: 'manual' });
  assert.equal(root.status, 302);
  assert.equal(root.headers.get('location'), '/students');
  const empty = await fetch(`${base}/students`);
  assert.match(await empty.text(), /Danh sách đang trống/);
  const form = await fetch(`${base}/students/new`);
  assert.equal(form.status, 200);
  assert.match(await form.text(), /method="post" action="\/students"/);
  const saved = await post(student(1, { name: '<script>alert(1)</script>' }));
  assert.equal(saved.status, 303);
  assert.equal(saved.headers.get('location'), '/students?added=1');
  const list = await fetch(`${base}/students?added=1`);
  assert.equal(list.status, 200);
  const html = await list.text();
  assert.match(html, /Đã thêm sinh viên thành công/);
  assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  assert.ok(!html.includes('<script>alert(1)</script>'));

  const duplicate = await post(student(1, { name: 'Tên được giữ lại' }));
  assert.equal(duplicate.status, 422);
  const errorHtml = await duplicate.text();
  assert.match(errorHtml, /Mã sinh viên này đã tồn tại/);
  assert.match(errorHtml, /value="Tên được giữ lại"/);
  const invalid = await post(student(2, { email: 'not-an-email' }));
  assert.equal(invalid.status, 422);
  assert.equal(JSON.parse(await fs.readFile(dataFile, 'utf8')).length, 1);
  const css = await fetch(`${base}/style.css`);
  assert.equal(css.status, 200);
  const missing = await fetch(`${base}/missing`);
  assert.equal(missing.status, 404);
  assert.match(await missing.text(), /Không tìm thấy trang/);
  const tooLarge = await post(student(3, { name: 'x'.repeat(12000) }));
  assert.equal(tooLarge.status, 413);

  await fs.writeFile(dataFile, '{broken');
  const broken = await fetch(`${base}/students`);
  assert.equal(broken.status, 500);
  const brokenHtml = await broken.text();
  assert.match(brokenHtml, /Không thể đọc hoặc lưu dữ liệu/);
  assert.ok(!brokenHtml.includes(dataFile));
  assert.equal(await fs.readFile(dataFile, 'utf8'), '{broken');
});
