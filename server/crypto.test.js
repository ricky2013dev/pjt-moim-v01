import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { test } from 'node:test';

process.env.MESSAGE_ENCRYPTION_KEY = randomBytes(32).toString('hex');
const { decryptText, encryptText, isEncrypted } = await import('./crypto.js');

test('round-trips text, including unicode', () => {
  const text = '안녕하세요 👋 see you at 7';
  const stored = encryptText(text);
  assert.ok(isEncrypted(stored));
  assert.ok(!stored.includes('see you'));
  assert.equal(decryptText(stored), text);
});

test('same plaintext encrypts differently each time', () => {
  assert.notEqual(encryptText('hi'), encryptText('hi'));
});

test('legacy plaintext passes through unchanged', () => {
  assert.equal(decryptText('old message'), 'old message');
});

test('tampered ciphertext is rejected', () => {
  const stored = encryptText('hello');
  const parts = stored.split(':');
  const ct = Buffer.from(parts[4], 'base64');
  ct[0] ^= 1;
  parts[4] = ct.toString('base64');
  assert.throws(() => decryptText(parts.join(':')));
});
