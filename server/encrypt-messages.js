// One-off: encrypts chat messages that were stored as plaintext before
// MESSAGE_ENCRYPTION_KEY was introduced. Safe to run more than once — rows
// that are already encrypted are skipped.
import { assertEncryptionKey, encryptText } from './crypto.js';

assertEncryptionKey();
const { pool } = await import('./db.js');
const client = await pool.connect();

try {
  await client.query('BEGIN');
  const { rows } = await client.query(
    `SELECT id, body FROM chat_messages WHERE body NOT LIKE 'enc:v1:%' FOR UPDATE`,
  );
  for (const row of rows) {
    await client.query('UPDATE chat_messages SET body = $1 WHERE id = $2', [encryptText(row.body), row.id]);
  }
  await client.query('COMMIT');
  console.log(`Encrypted ${rows.length} chat message(s).`);
} catch (err) {
  await client.query('ROLLBACK');
  throw err;
} finally {
  client.release();
  await pool.end();
}
