import { readFile } from 'node:fs/promises';

export async function initializeSchema(query) {
  const sql = await readFile(new URL('./schema.sql', import.meta.url), 'utf8');
  await query(sql);
}
