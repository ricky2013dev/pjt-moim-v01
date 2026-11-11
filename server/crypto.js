import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

// Application-level encryption for data at rest (chat message bodies).
// AES-256-GCM: each value gets a fresh 12-byte IV, and the auth tag makes
// tampered ciphertext fail to decrypt instead of returning garbage.
// Stored format: "enc:v1:<iv>:<tag>:<ciphertext>", all base64.

const PREFIX = 'enc:v1:';
let cachedKey;

function loadKey() {
  if (cachedKey) return cachedKey;
  const raw = process.env.MESSAGE_ENCRYPTION_KEY || '';
  const key = /^[0-9a-f]{64}$/i.test(raw) ? Buffer.from(raw, 'hex') : Buffer.from(raw, 'base64');
  if (key.length !== 32) {
    throw new Error(
      'MESSAGE_ENCRYPTION_KEY must be 32 bytes (64 hex chars or base64). Generate with: '
      + `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`,
    );
  }
  cachedKey = key;
  return key;
}

// Call at startup so a missing/bad key fails loudly instead of on first message.
export function assertEncryptionKey() {
  loadKey();
}

export const isEncrypted = (value) => typeof value === 'string' && value.startsWith(PREFIX);

export function encryptText(plaintext) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', loadKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(String(plaintext), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${PREFIX}${iv.toString('base64')}:${tag.toString('base64')}:${ciphertext.toString('base64')}`;
}

// Values without the prefix are legacy plaintext rows written before
// encryption was turned on; they're returned as-is until migrated.
export function decryptText(stored) {
  if (!isEncrypted(stored)) return stored;
  const [iv, tag, ciphertext] = stored.slice(PREFIX.length).split(':');
  const decipher = createDecipheriv('aes-256-gcm', loadKey(), Buffer.from(iv, 'base64'));
  decipher.setAuthTag(Buffer.from(tag, 'base64'));
  return Buffer.concat([decipher.update(Buffer.from(ciphertext, 'base64')), decipher.final()]).toString('utf8');
}
