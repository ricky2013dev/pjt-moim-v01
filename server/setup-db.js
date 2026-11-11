import { initializeSchema } from './schema.js';

if (process.env.NODE_ENV === 'production') {
  throw new Error('Refusing to initialize schema when NODE_ENV=production.');
}

const { pool, query } = await import('./db.js');

try {
  await initializeSchema(query);
  console.log('Development database schema is ready.');
} finally {
  await pool.end();
}
