import pg from 'pg';
import bcrypt from 'bcryptjs';

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL is not set. Copy .env.example to .env.');
}

export const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : undefined,
});

export const query = (text, params) => pool.query(text, params);

const REQUIRED_APPLICATION_TABLES = [
  'members',
  'settings',
  'announcements',
  'announcement_targets',
  'announcement_reads',
  'messages',
  'push_tokens',
];

export async function validateApplicationSchema() {
  const { rows } = await query(`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = ANY(current_schemas(false))
      AND table_type = 'BASE TABLE'
  `);
  const availableTables = new Set(rows.map(({ table_name }) => table_name));
  const missingTables = REQUIRED_APPLICATION_TABLES.filter((table) => !availableTables.has(table));

  if (missingTables.length) {
    throw new Error(
      `Database schema is incomplete. Missing required tables: ${missingTables.join(', ')}. `
      + 'Initialize the database schema before starting the application.',
    );
  }
}

export async function getSetting(key) {
  const { rows } = await query('SELECT value FROM settings WHERE key = $1', [key]);
  return rows[0]?.value ?? null;
}

export async function setSetting(key, value) {
  await query(
    `INSERT INTO settings (key, value) VALUES ($1, $2)
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
    [key, value],
  );
}

export async function seedInitialData() {
  if (!(await getSetting('default_passcode_hash'))) {
    const pin = process.env.DEFAULT_PASSCODE;
    if (!/^\d{4}$/.test(pin || '')) throw new Error('Set DEFAULT_PASSCODE to four digits in Secrets.');
    await setSetting('default_passcode_hash', await bcrypt.hash(pin, 10));
  }

  const { rowCount } = await query(`SELECT 1 FROM members WHERE role = 'admin' LIMIT 1`);
  if (!rowCount) {
    const name = process.env.ADMIN_NAME || 'Admin';
    const pin = process.env.ADMIN_PASSCODE;
    if (!/^\d{4}$/.test(pin || '')) throw new Error('Set ADMIN_PASSCODE to four digits in Secrets.');
    await query(
      `INSERT INTO members (name, relationship, role, passcode_hash) VALUES ($1, 'Admin', 'admin', $2)`,
      [name, await bcrypt.hash(pin, 10)],
    );
    console.log(`Created admin "${name}". Log in with the ADMIN_PASSCODE from your env file.`);
  }
}
