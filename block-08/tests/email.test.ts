import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer, type Socket } from 'node:net';
import { mailer, verificationEmail, resetEmail } from '../src/auth/email.js';

// Exercise the real Nodemailer transport against a local SMTP sink. No external
// provider is contacted and no message leaves this process.
const messages: string[] = [];
const sockets = new Set<Socket>();
let rejectRecipient = false;
const smtp = createServer(socket => {
  sockets.add(socket);
  socket.on('close', () => sockets.delete(socket));
  socket.write('220 localhost test SMTP\r\n');
  let pending = '', data = false, body: string[] = [];
  socket.on('data', chunk => {
    pending += chunk.toString();
    while (pending.includes('\r\n')) {
      const end = pending.indexOf('\r\n');
      const line = pending.slice(0, end);
      pending = pending.slice(end + 2);
      if (data) {
        if (line !== '.') { body.push(line); continue; }
        messages.push(body.join('\r\n'));
        body = []; data = false;
        socket.write('250 Queued\r\n');
      } else if (/^EHLO|^HELO/.test(line)) socket.write('250-localhost\r\n250 SIZE 1000000\r\n');
      else if (/^MAIL FROM:/.test(line)) socket.write('250 Sender OK\r\n');
      else if (/^RCPT TO:/.test(line)) socket.write(rejectRecipient ? '550 Recipient rejected\r\n' : '250 Recipient OK\r\n');
      else if (line === 'DATA') { data = true; socket.write('354 End with dot\r\n'); }
      else if (line === 'QUIT') { socket.end('221 Bye\r\n'); }
      else socket.write('250 OK\r\n');
    }
  });
});
const envKeys = ['SMTP_HOST', 'SMTP_PORT', 'SMTP_SECURE', 'SMTP_REQUIRE_TLS', 'SMTP_USER', 'SMTP_PASSWORD', 'SMTP_FROM', 'APP_URL', 'NODE_ENV'];
const saved = Object.fromEntries(envKeys.map(key => [key, process.env[key]]));
test('shared SMTP transport', async t => {
  await new Promise<void>(resolve => smtp.listen(0, '127.0.0.1', resolve));
  Object.assign(process.env, {
    SMTP_HOST: '127.0.0.1', SMTP_PORT: String((smtp.address() as { port: number }).port),
    SMTP_SECURE: 'false', SMTP_REQUIRE_TLS: 'false', SMTP_USER: '', SMTP_PASSWORD: '',
    SMTP_FROM: 'Bep Nha <noreply@example.test>', APP_URL: 'http://localhost:3000', NODE_ENV: 'test',
  });
  assert.ok(process.env.SMTP_HOST && process.env.SMTP_FROM, 'SMTP fixture environment must be configured');
  try {
    await t.test('actually delivers verification and password-reset messages', async () => {
      assert.ok(process.env.SMTP_HOST && process.env.SMTP_FROM, 'SMTP fixture environment must remain configured during the test');
      await mailer.send(verificationEmail('member@example.test', '123456'));
      const token = 'a'.repeat(64);
      await mailer.send(resetEmail('member@example.test', token));
      assert.equal(messages.length, 2);
      assert.match(messages[0], /To: member@example\.test/);
      assert.match(messages[0], /123456/);
      const reset = messages[1].replace(/=\r\n/g, '').replace(/=3D/g, '=');
      assert.ok(reset.includes(`/auth/reset-password?token=${token}`));
    });

    await t.test('SMTP rejection is reported as failure rather than successful registration delivery', async () => {
      rejectRecipient = true;
      try { await assert.rejects(mailer.send(verificationEmail('rejected@example.test', '123456'))); }
      finally { rejectRecipient = false; }
      assert.equal(messages.length, 2);
    });

    await t.test('fails closed for absent SMTP and an untrusted recovery origin', async () => {
      delete process.env.SMTP_HOST;
      await assert.rejects(mailer.send(verificationEmail('member@example.test', '123456')));
      process.env.SMTP_HOST = '127.0.0.1';
      process.env.APP_URL = 'http://untrusted.example.test';
      assert.throws(() => resetEmail('member@example.test', 'a'.repeat(64)));
      process.env.APP_URL = 'http://localhost:3000';
    });
  } finally {
    for (const socket of sockets) socket.destroy();
    await new Promise<void>(resolve => smtp.close(() => resolve()));
    for (const key of envKeys) {
      if (saved[key] === undefined) delete process.env[key];
      else process.env[key] = saved[key];
    }
  }
});
