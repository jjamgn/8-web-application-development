import { test } from 'node:test';
import assert from 'node:assert/strict';
import bcrypt from 'bcryptjs';
import { registrationSchema, passwordSchema } from '../src/validation/registration.js';
import { hashPassword } from '../src/services/password.js';

test('registration normalizes email and strips role/status fields supplied by the form', () => {
  const parsed = registrationSchema.parse({ email: '  Student@Example.test ', password: 'a strong pass', confirmPassword: 'a strong pass', role: 'admin', status: 'active' });
  assert.equal(parsed.email, 'student@example.test');
  assert.equal('role' in parsed, false);
  assert.equal('status' in parsed, false);
});

test('registration rejects invalid email and mismatching password confirmation', () => {
  assert.equal(registrationSchema.safeParse({ email: 'bad', password: 'password123', confirmPassword: 'password123' }).success, false);
  const parsed = registrationSchema.safeParse({ email: 'student@example.test', password: 'password123', confirmPassword: 'different' });
  assert.equal(parsed.success, false);
  if (!parsed.success) assert.ok(parsed.error.flatten().fieldErrors.confirmPassword);
});

test('passwords require eight Unicode characters and respect the 72-byte bcrypt boundary', () => {
  assert.equal(passwordSchema.safeParse('abcdefg').success, false);
  assert.equal(passwordSchema.safeParse('😀'.repeat(4)).success, false);
  assert.equal(passwordSchema.safeParse('😀'.repeat(8)).success, true);
  assert.equal(passwordSchema.safeParse('a'.repeat(72)).success, true);
  assert.equal(passwordSchema.safeParse('a'.repeat(73)).success, false);
  assert.equal(passwordSchema.safeParse('á'.repeat(36)).success, true);
  assert.equal(passwordSchema.safeParse('á'.repeat(37)).success, false);
});

test('hashPassword preserves password whitespace and produces a bcrypt-compatible hash', async () => {
  const password = '  password123  ';
  const hash = await hashPassword(password);
  assert.notEqual(hash, password);
  assert.equal(await bcrypt.compare(password, hash), true);
  assert.equal(await bcrypt.compare(password.trim(), hash), false);
  await assert.rejects(hashPassword('a'.repeat(73)));
});
