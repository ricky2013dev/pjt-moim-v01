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

const REQUIRED_APPLICATION_COLUMNS = {
  members: [
    'id',
    'name',
    'phone',
    'phone2',
    'email',
    'address',
    'note',
    'comment',
    'sort_order',
    'role',
    'passcode_hash',
    'passcode_version',
    'photo',
    'photo_mime',
    'photo_version',
    'failed_logins',
    'locked_until',
    'created_at',
    'updated_at',
  ],
  settings: ['key', 'value'],
  announcements: ['id', 'title', 'body', 'audience', 'author_id', 'created_at', 'updated_at'],
  announcement_targets: ['announcement_id', 'member_id'],
  announcement_reads: ['announcement_id', 'member_id', 'read_at'],
  chat_messages: ['id', 'sender_id', 'body', 'created_at'],
  chat_reads: ['member_id', 'last_read_id'],
  push_tokens: ['token', 'member_id', 'created_at'],
  events: ['id', 'title', 'description', 'location', 'starts_at', 'author_id', 'created_at', 'updated_at'],
  event_rsvps: ['event_id', 'member_id', 'status', 'adults', 'kids', 'updated_at'],
};

export async function validateApplicationSchema() {
  const { rows } = await query(`
    SELECT table_schema, table_name, column_name
    FROM information_schema.columns
    JOIN information_schema.tables USING (table_catalog, table_schema, table_name)
    WHERE table_schema = ANY(current_schemas(false))
      AND table_name = ANY($1::text[])
      AND table_type = 'BASE TABLE'
    ORDER BY array_position(current_schemas(false), table_schema)
  `, [Object.keys(REQUIRED_APPLICATION_COLUMNS)]);
  const availableColumns = new Map();
  for (const { table_schema, table_name, column_name } of rows) {
    const existing = availableColumns.get(table_name);
    // Match PostgreSQL's search_path: only inspect the first schema that
    // defines each table, not a union of same-named tables across schemas.
    if (existing && existing.schema !== table_schema) continue;
    if (!existing) availableColumns.set(table_name, { schema: table_schema, columns: new Set() });
    availableColumns.get(table_name).columns.add(column_name);
  }

  const requiredTables = Object.keys(REQUIRED_APPLICATION_COLUMNS);
  const missingTables = requiredTables.filter((table) => !availableColumns.has(table));
  const missingColumns = requiredTables.flatMap((table) => {
    const available = availableColumns.get(table)?.columns;
    return available
      ? REQUIRED_APPLICATION_COLUMNS[table]
        .filter((column) => !available.has(column))
        .map((column) => `${table}.${column}`)
      : [];
  });

  const problems = [];
  if (missingTables.length) problems.push(`Missing required tables: ${missingTables.join(', ')}.`);
  if (missingColumns.length) problems.push(`Missing required columns: ${missingColumns.join(', ')}.`);
  if (problems.length) {
    throw new Error(`Database schema is incomplete. ${problems.join(' ')} Initialize the database schema before starting the application.`);
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
      `INSERT INTO members (name, role, passcode_hash) VALUES ($1, 'admin', $2)`,
      [name, await bcrypt.hash(pin, 10)],
    );
    console.log(`Created admin "${name}". Log in with the ADMIN_PASSCODE from your env file.`);
  }
}
