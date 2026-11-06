import { test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import nodemailer, { type SendMailOptions, type SMTPTransportOptions } from 'nodemailer';
import { MailError, sendMail } from '../src/services/mailer.js';

const environment = {
  SMTP_HOST: 'smtp.example.test',
  SMTP_PORT: '587',
  SMTP_SECURE: 'false',
  SMTP_USER: 'mailer@example.test',
  SMTP_PASS: 'private-smtp-password',
  MAIL_FROM: 'Bếp Nhà <mailer@example.test>',
};
const message = {
  to: 'recipient@example.test',
  subject: 'Xác minh email',
  text: 'Mã kiểm thử: 482915',
  html: '<p>Mã kiểm thử: <strong>482915</strong></p>',
};

function configure(t: TestContext) {
  const previous = Object.fromEntries(Object.keys(environment).map(key => [key, process.env[key]]));
  Object.assign(process.env, environment);
  t.after(() => {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });
}

function hasCode(code: MailError['code']) {
  return (error: unknown) => error instanceof MailError && error.code === code;
}

test('mailer rejects every missing SMTP setting before creating a transport', async t => {
  configure(t);
  const transport = t.mock.method(nodemailer, 'createTransport', () => {
    throw new Error('Transport must not be created for invalid configuration.');
  });
  for (const key of Object.keys(environment)) {
    const value = process.env[key];
    process.env[key] = '';
    await assert.rejects(sendMail(message), hasCode('MAIL_CONFIG_INVALID'));
    process.env[key] = value;
  }
  assert.equal(transport.mock.callCount(), 0);
});

test('mailer rejects invalid port and boolean settings without leaking their values', async t => {
  configure(t);
  const transport = t.mock.method(nodemailer, 'createTransport', () => {
    throw new Error('Transport must not be created.');
  });
  for (const value of ['0', '65536', '587.5', '5e2', 'not-a-port']) {
    process.env.SMTP_PORT = value;
    await assert.rejects(sendMail(message), hasCode('MAIL_CONFIG_INVALID'));
  }
  process.env.SMTP_PORT = '587';
  process.env.SMTP_SECURE = 'not-a-boolean-secret';
  await assert.rejects(sendMail(message), (error: unknown) => {
    assert.ok(error instanceof MailError);
    assert.equal(error.code, 'MAIL_CONFIG_INVALID');
    assert.match(error.message, /SMTP_SECURE/);
    assert.doesNotMatch(error.message, /not-a-boolean-secret|private-smtp-password|482915/);
    return true;
  });
  assert.equal(transport.mock.callCount(), 0);
});

test('mailer rejects multiple recipients, header injection and empty bodies before sending', async t => {
  configure(t);
  const transport = t.mock.method(nodemailer, 'createTransport', () => {
    throw new Error('Transport must not be created for an invalid message.');
  });
  for (const invalid of [
    { ...message, to: 'first@example.test,second@example.test' },
    { ...message, to: 'invalid-email' },
    { ...message, subject: 'OTP\r\nBcc: other@example.test' },
    { ...message, text: '' },
  ]) {
    await assert.rejects(sendMail(invalid), hasCode('MAIL_MESSAGE_INVALID'));
  }
  assert.equal(transport.mock.callCount(), 0);
});

test('mailer composes both text and HTML with Nodemailer and waits for SMTP acceptance', async t => {
  configure(t);
  const jsonTransport = nodemailer.createTransport({ jsonTransport: true });
  let smtpOptions: SMTPTransportOptions | undefined;
  let composed: Record<string, unknown> | undefined;
  let accept: (() => void) | undefined;
  const accepted = new Promise<void>(resolve => { accept = resolve; });
  t.mock.method(nodemailer, 'createTransport', (options: SMTPTransportOptions) => {
    smtpOptions = options;
    return {
      async sendMail(options: SendMailOptions) {
        const result = await jsonTransport.sendMail(options);
        composed = JSON.parse(result.message);
        await accepted;
        return { accepted: [message.to], rejected: [] };
      },
    };
  });

  let finished = false;
  const sending = sendMail(message).then(() => { finished = true; });
  await new Promise<void>(resolve => setImmediate(resolve));
  assert.equal(finished, false);
  accept!();
  assert.equal(await sending, undefined);
  assert.equal(smtpOptions?.port, 587);
  assert.equal(smtpOptions?.secure, false);
  assert.equal(composed?.text, message.text);
  assert.equal(composed?.html, message.html);
  assert.deepEqual(composed?.to, [{ address: message.to, name: '' }]);
  assert.deepEqual(composed?.from, { address: 'mailer@example.test', name: 'Bếp Nhà' });
});

test('mailer supports secure SMTP and a plain-text-only reset message', async t => {
  configure(t);
  process.env.SMTP_PORT = '465';
  process.env.SMTP_SECURE = 'true';
  let sent: SendMailOptions | undefined;
  t.mock.method(nodemailer, 'createTransport', (options: SMTPTransportOptions) => {
    assert.equal(options.secure, true);
    assert.equal(options.port, 465);
    return {
      async sendMail(options: SendMailOptions) {
        sent = options;
        return { accepted: [message.to], rejected: [] };
      },
    };
  });
  await sendMail({ to: message.to, subject: 'Đặt lại mật khẩu', text: 'Link kiểm thử đặt lại mật khẩu.' });
  assert.equal(sent?.html, undefined);
  assert.match(String(sent?.text), /Link kiểm thử/);
});

test('mailer hides provider errors and never retries a failed submission', async t => {
  configure(t);
  let attempts = 0;
  t.mock.method(nodemailer, 'createTransport', () => ({
    async sendMail() {
      attempts++;
      throw new Error(`Provider failure: ${environment.SMTP_PASS}; ${message.to}; ${message.text}`);
    },
  }));
  await assert.rejects(sendMail(message), (error: unknown) => {
    assert.ok(error instanceof MailError);
    assert.equal(error.code, 'MAIL_SEND_FAILED');
    assert.doesNotMatch(String(error), /private-smtp-password|recipient@example.test|482915/);
    assert.equal(error.cause, undefined);
    return true;
  });
  assert.equal(attempts, 1);
});

test('mailer treats SMTP rejection or an unaccepted recipient as a send failure', async t => {
  configure(t);
  let result: { accepted: string[]; rejected: string[] };
  t.mock.method(nodemailer, 'createTransport', () => ({ async sendMail() { return result; } }));
  for (result of [
    { accepted: [], rejected: [message.to] },
    { accepted: [], rejected: [] },
    { accepted: ['other@example.test'], rejected: [] },
  ]) {
    await assert.rejects(sendMail(message), hasCode('MAIL_SEND_FAILED'));
  }
});
