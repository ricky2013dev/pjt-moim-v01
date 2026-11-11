import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { execFileSync, spawn } from 'node:child_process';
import net from 'node:net';
import { test } from 'node:test';
import pg from 'pg';

const { Client } = pg;

function databaseUrlForSchema(databaseUrl, schema) {
  const url = new URL(databaseUrl);
  const options = [url.searchParams.get('options'), `-csearch_path=${schema}`]
    .filter(Boolean)
    .join(' ');
  url.searchParams.set('options', options);
  return url.toString();
}

async function reservePort() {
  const server = net.createServer();
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const { port } = server.address();
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  return port;
}

function waitForStartup(child) {
  return new Promise((resolve, reject) => {
    let output = '';
    const timeout = setTimeout(() => reject(new Error(`Server did not start: ${output}`)), 15_000);
    child.stdout.on('data', (chunk) => {
      output += chunk.toString();
      if (output.includes('API listening on')) {
        clearTimeout(timeout);
        resolve();
      }
    });
    child.stderr.on('data', (chunk) => {
      output += chunk.toString();
    });
    child.once('error', (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    child.once('exit', (code) => {
      clearTimeout(timeout);
      reject(new Error(`Server exited before starting (code ${code}): ${output}`));
    });
  });
}

test('fresh development setup and production-style startup do not run startup DDL', {
  skip: !process.env.DATABASE_URL
    ? 'Set DATABASE_URL to run isolated database setup integration tests.'
    : false,
}, async (t) => {
  const originalEnvironment = {
    DATABASE_URL: process.env.DATABASE_URL,
    NODE_ENV: process.env.NODE_ENV,
    ADMIN_NAME: process.env.ADMIN_NAME,
    ADMIN_PASSCODE: process.env.ADMIN_PASSCODE,
    DEFAULT_PASSCODE: process.env.DEFAULT_PASSCODE,
    JWT_SECRET: process.env.JWT_SECRET,
  };
  const developmentSchema = `setup_test_${process.pid}_${randomBytes(5).toString('hex')}`;
  const productionStyleSchema = `startup_test_${process.pid}_${randomBytes(5).toString('hex')}`;
  let db;
  let server;

  t.after(async () => {
    if (server && server.exitCode === null) {
      await new Promise((resolve) => {
        server.once('exit', resolve);
        server.kill('SIGTERM');
        const killTimeout = setTimeout(() => {
          if (server.exitCode === null) server.kill('SIGKILL');
        }, 3_000);
        killTimeout.unref();
      });
    }
    if (db?.pool) await db.pool.end();

    const cleanup = new Client({ connectionString: originalEnvironment.DATABASE_URL });
    try {
      await cleanup.connect();
      await cleanup.query(`DROP SCHEMA IF EXISTS "${developmentSchema}" CASCADE`);
      await cleanup.query(`DROP SCHEMA IF EXISTS "${productionStyleSchema}" CASCADE`);
    } finally {
      await cleanup.end();
    }

    for (const [key, value] of Object.entries(originalEnvironment)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  const setup = new Client({ connectionString: originalEnvironment.DATABASE_URL });
  try {
    await setup.connect();
    await setup.query(`CREATE SCHEMA "${developmentSchema}"`);
    await setup.query(`CREATE SCHEMA "${productionStyleSchema}"`);
  } finally {
    await setup.end();
  }

  process.env.DATABASE_URL = databaseUrlForSchema(originalEnvironment.DATABASE_URL, developmentSchema);
  process.env.NODE_ENV = 'development';
  process.env.ADMIN_NAME = 'Setup Test Admin';
  process.env.ADMIN_PASSCODE = '4826';
  process.env.DEFAULT_PASSCODE = '1357';

  execFileSync(process.execPath, ['server/setup-db.js'], {
    env: {
      ...process.env,
      DATABASE_URL: process.env.DATABASE_URL,
      NODE_ENV: 'development',
    },
    encoding: 'utf8',
  });

  db = await import('./db.js');
  const { rows: developmentTables } = await db.query(
    `SELECT tablename FROM pg_tables WHERE schemaname = $1 ORDER BY tablename`,
    [developmentSchema],
  );
  assert.deepEqual(developmentTables.map(({ tablename }) => tablename), [
    'announcement_reads',
    'announcement_targets',
    'announcements',
    'members',
    'messages',
    'push_tokens',
    'settings',
  ]);

  await db.seedInitialData();
  const { rows: adminRows } = await db.query(
    `SELECT name, role FROM members WHERE role = 'admin'`,
  );
  assert.deepEqual(adminRows, [{ name: 'Setup Test Admin', role: 'admin' }]);
  const { rows: settingRows } = await db.query(
    `SELECT key FROM settings WHERE key = 'default_passcode_hash'`,
  );
  assert.equal(settingRows.length, 1);

  const productionStyleUrl = databaseUrlForSchema(originalEnvironment.DATABASE_URL, productionStyleSchema);
  const productionStyleSetup = new Client({ connectionString: productionStyleUrl });
  try {
    await productionStyleSetup.connect();
    await productionStyleSetup.query(`
      CREATE TABLE settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
      CREATE TABLE members (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        relationship TEXT NOT NULL DEFAULT '',
        role TEXT NOT NULL CHECK (role IN ('admin', 'member')),
        passcode_hash TEXT NOT NULL
      );
    `);
  } finally {
    await productionStyleSetup.end();
  }

  const port = await reservePort();
  server = spawn(process.execPath, ['server/index.js'], {
    env: {
      ...process.env,
      DATABASE_URL: productionStyleUrl,
      NODE_ENV: 'production',
      ADMIN_NAME: 'Production Startup Test Admin',
      ADMIN_PASSCODE: '2468',
      DEFAULT_PASSCODE: '8642',
      JWT_SECRET: 'production-style-startup-test-secret',
      PORT: String(port),
      FIREBASE_SERVICE_ACCOUNT: '',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  await waitForStartup(server);

  const verify = new Client({ connectionString: productionStyleUrl });
  try {
    await verify.connect();
    const { rows: productionStyleTables } = await verify.query(
      `SELECT tablename FROM pg_tables WHERE schemaname = $1 ORDER BY tablename`,
      [productionStyleSchema],
    );
    assert.deepEqual(productionStyleTables.map(({ tablename }) => tablename), ['members', 'settings']);

    const { rows: productionStyleAdmins } = await verify.query(
      `SELECT name, role FROM members WHERE role = 'admin'`,
    );
    assert.deepEqual(productionStyleAdmins, [{ name: 'Production Startup Test Admin', role: 'admin' }]);
  } finally {
    await verify.end();
  }
});
