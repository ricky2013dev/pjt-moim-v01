import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import cookieParser from 'cookie-parser';
import express from 'express';
import bcrypt from 'bcryptjs';
import pg from 'pg';

const { Client } = pg;
const TEST_PASSCODE = '4826';
const WRONG_PASSCODE = '0000';

let app;
let server;
let baseUrl;
let db;
let schema;
let originalEnvironment;

test('passcode login and authorization integration', {
  skip: !process.env.DATABASE_URL
    ? 'Set DATABASE_URL to run the isolated PostgreSQL auth integration tests.'
    : false,
}, async (t) => {
  originalEnvironment = {
    DATABASE_URL: process.env.DATABASE_URL,
    NODE_ENV: process.env.NODE_ENV,
    JWT_SECRET: process.env.JWT_SECRET,
  };

  schema = `auth_test_${process.pid}_${randomBytes(6).toString('hex')}`;
  t.after(async () => {
    if (server) {
      await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    }
    if (db?.pool) await db.pool.end();

    if (schema && originalEnvironment?.DATABASE_URL) {
      const cleanupClient = new Client({ connectionString: originalEnvironment.DATABASE_URL });
      try {
        await cleanupClient.connect();
        await cleanupClient.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
      } finally {
        await cleanupClient.end();
      }
    }

    if (originalEnvironment) {
      process.env.DATABASE_URL = originalEnvironment.DATABASE_URL;
      if (originalEnvironment.NODE_ENV === undefined) delete process.env.NODE_ENV;
      else process.env.NODE_ENV = originalEnvironment.NODE_ENV;
      if (originalEnvironment.JWT_SECRET === undefined) delete process.env.JWT_SECRET;
      else process.env.JWT_SECRET = originalEnvironment.JWT_SECRET;
    }
  });

  const setupClient = new Client({ connectionString: originalEnvironment.DATABASE_URL });
  try {
    await setupClient.connect();
    await setupClient.query(`CREATE SCHEMA "${schema}"`);
  } finally {
    await setupClient.end();
  }

  const isolatedUrl = new URL(originalEnvironment.DATABASE_URL);
  const connectionOptions = [
    isolatedUrl.searchParams.get('options'),
    `-csearch_path=${schema}`,
  ].filter(Boolean).join(' ');
  isolatedUrl.searchParams.set('options', connectionOptions);
  process.env.DATABASE_URL = isolatedUrl.toString();
  process.env.NODE_ENV = 'test';
  process.env.JWT_SECRET = 'isolated-auth-integration-test-secret';

  db = await import('./db.js');
  const schemaSql = await readFile(new URL('./schema.sql', import.meta.url), 'utf8');
  await db.query(schemaSql);

  const defaultPasscodeHash = await bcrypt.hash(TEST_PASSCODE, 4);
  await db.query(
    'INSERT INTO settings (key, value) VALUES ($1, $2)',
    ['default_passcode_hash', defaultPasscodeHash],
  );

  const [authRoutes, memberRoutes] = await Promise.all([
    import('./routes/auth.js'),
    import('./routes/members.js'),
  ]);
  app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use('/api', authRoutes.default, memberRoutes.default);
  server = app.listen(0, '127.0.0.1');
  await new Promise((resolve, reject) => {
    server.once('listening', resolve);
    server.once('error', reject);
  });
  baseUrl = `http://127.0.0.1:${server.address().port}/api`;

  async function createMember(role = 'member') {
    const hash = await bcrypt.hash(TEST_PASSCODE, 4);
    const { rows } = await db.query(
      `INSERT INTO members (name, relationship, role, passcode_hash)
       VALUES ($1, 'Test', $2, $3) RETURNING id`,
      [`Auth test ${randomBytes(4).toString('hex')}`, role, hash],
    );
    return rows[0].id;
  }

  async function request(path, { method = 'GET', body, cookie } = {}) {
    const headers = {};
    if (body !== undefined) headers['content-type'] = 'application/json';
    if (cookie) headers.cookie = cookie;
    const response = await fetch(`${baseUrl}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await response.text();
    return {
      response,
      data: text ? JSON.parse(text) : null,
      cookie: response.headers.get('set-cookie')?.split(';', 1)[0],
    };
  }

  await t.test('successful login creates a usable session', async () => {
    const memberId = await createMember();
    const login = await request('/auth/login', {
      method: 'POST',
      body: { memberId, passcode: TEST_PASSCODE },
    });

    assert.equal(login.response.status, 200);
    assert.equal(login.data.id, memberId);
    assert.equal(login.data.role, 'member');
    assert.ok(login.cookie?.startsWith('moim_session='));
    assert.equal('passcode_hash' in login.data, false);

    const me = await request('/auth/me', { cookie: login.cookie });
    assert.equal(me.response.status, 200);
    assert.equal(me.data.id, memberId);
  });

  await t.test('wrong passcodes are rejected and counted', async () => {
    const memberId = await createMember();
    const attempt = await request('/auth/login', {
      method: 'POST',
      body: { memberId, passcode: WRONG_PASSCODE },
    });
    const { rows } = await db.query('SELECT failed_logins FROM members WHERE id = $1', [memberId]);

    assert.equal(attempt.response.status, 401);
    assert.match(attempt.data.error, /Wrong passcode/);
    assert.equal(rows[0].failed_logins, 1);
  });

  await t.test('fifth wrong passcode locks the account', async () => {
    const memberId = await createMember();
    for (let attemptNumber = 1; attemptNumber <= 5; attemptNumber += 1) {
      const attempt = await request('/auth/login', {
        method: 'POST',
        body: { memberId, passcode: WRONG_PASSCODE },
      });
      assert.equal(attempt.response.status, 401);
    }

    const locked = await request('/auth/login', {
      method: 'POST',
      body: { memberId, passcode: TEST_PASSCODE },
    });
    const { rows } = await db.query('SELECT failed_logins, locked_until FROM members WHERE id = $1', [memberId]);
    assert.equal(locked.response.status, 429);
    assert.match(locked.data.error, /Too many tries/);
    assert.equal(rows[0].failed_logins, 0);
    assert.ok(rows[0].locked_until);
  });

  await t.test('changing a passcode invalidates other sessions', async () => {
    const memberId = await createMember();
    const login = await request('/auth/login', {
      method: 'POST',
      body: { memberId, passcode: TEST_PASSCODE },
    });
    const changed = await request('/me/passcode', {
      method: 'POST',
      cookie: login.cookie,
      body: { current: TEST_PASSCODE, next: '7391' },
    });

    assert.equal(changed.response.status, 200);
    assert.equal(changed.data.ok, true);

    const oldSession = await request('/auth/me', { cookie: login.cookie });
    assert.equal(oldSession.response.status, 401);
    assert.match(oldSession.data.error, /Passcode changed/);

    const currentSession = await request('/auth/me', { cookie: changed.cookie });
    assert.equal(currentSession.response.status, 200);
    assert.equal(currentSession.data.id, memberId);

    const newLogin = await request('/auth/login', {
      method: 'POST',
      body: { memberId, passcode: '7391' },
    });
    assert.equal(newLogin.response.status, 200);
  });

  await t.test('members are denied admin actions while admins are allowed', async () => {
    const memberId = await createMember('member');
    const adminId = await createMember('admin');
    const memberLogin = await request('/auth/login', {
      method: 'POST',
      body: { memberId, passcode: TEST_PASSCODE },
    });
    const adminLogin = await request('/auth/login', {
      method: 'POST',
      body: { memberId: adminId, passcode: TEST_PASSCODE },
    });

    const denied = await request('/admin/members', {
      method: 'POST',
      cookie: memberLogin.cookie,
      body: { name: 'Should not be created' },
    });
    const allowed = await request('/admin/members', {
      method: 'POST',
      cookie: adminLogin.cookie,
      body: { name: 'Admin-created test member' },
    });

    assert.equal(denied.response.status, 403);
    assert.equal(denied.data.error, 'Admins only');
    assert.equal(allowed.response.status, 201);
    assert.equal(allowed.data.name, 'Admin-created test member');
  });
});
