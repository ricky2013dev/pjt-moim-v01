import { Router } from 'express';
import { pool, query } from '../db.js';
import { requireAuth, requireAdmin } from '../auth.js';
import { notifyMembers } from '../push.js';

const r = Router();
r.use(requireAuth);

const VISIBLE = `(a.audience = 'all' OR EXISTS (
  SELECT 1 FROM announcement_targets t WHERE t.announcement_id = a.id AND t.member_id = $1))`;

r.get('/announcements', async (req, res) => {
  const admin = req.member.role === 'admin';
  const { rows } = await query(
    `SELECT a.id, a.title, a.body, a.audience, a.created_at, a.updated_at,
            au.name AS author_name,
            (rd.member_id IS NOT NULL) AS read,
            COALESCE((SELECT json_agg(json_build_object('id', m.id, 'name', m.name) ORDER BY m.name)
                      FROM announcement_targets t JOIN members m ON m.id = t.member_id
                      WHERE t.announcement_id = a.id), '[]') AS targets
     FROM announcements a
     LEFT JOIN members au ON au.id = a.author_id
     LEFT JOIN announcement_reads rd ON rd.announcement_id = a.id AND rd.member_id = $1
     WHERE ${admin ? 'TRUE OR $1 IS NULL' : VISIBLE}
     ORDER BY a.updated_at DESC`,
    [req.member.id],
  );
  res.json(rows);
});

r.post('/announcements/read-all', async (req, res) => {
  await query(
    `INSERT INTO announcement_reads (announcement_id, member_id)
     SELECT a.id, $1 FROM announcements a WHERE ${VISIBLE}
     ON CONFLICT DO NOTHING`,
    [req.member.id],
  );
  res.json({ ok: true });
});

function parse(body) {
  const title = String(body?.title || '').trim().slice(0, 200);
  const text = String(body?.body || '').trim().slice(0, 5000);
  const audience = body?.audience === 'selected' ? 'selected' : 'all';
  const targetIds = audience === 'selected' ? [...new Set((body?.targetIds || []).map(Number).filter(Boolean))] : [];
  if (!title) throw Object.assign(new Error('Title is required.'), { status: 400 });
  if (audience === 'selected' && !targetIds.length) throw Object.assign(new Error('Pick at least one family member.'), { status: 400 });
  return { title, text, audience, targetIds };
}

async function save(id, a, authorId) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    if (id) {
      const { rowCount } = await client.query(
        `UPDATE announcements SET title = $2, body = $3, audience = $4, updated_at = now() WHERE id = $1`,
        [id, a.title, a.text, a.audience],
      );
      if (!rowCount) throw Object.assign(new Error('Announcement not found'), { status: 404 });
      await client.query('DELETE FROM announcement_targets WHERE announcement_id = $1', [id]);
      // Updated announcements show as unread again.
      await client.query('DELETE FROM announcement_reads WHERE announcement_id = $1 AND member_id <> $2', [id, authorId]);
    } else {
      const { rows } = await client.query(
        `INSERT INTO announcements (title, body, audience, author_id) VALUES ($1, $2, $3, $4) RETURNING id`,
        [a.title, a.text, a.audience, authorId],
      );
      id = rows[0].id;
    }
    if (a.targetIds.length) {
      await client.query(
        `INSERT INTO announcement_targets (announcement_id, member_id)
         SELECT $1, unnest($2::int[]) ON CONFLICT DO NOTHING`,
        [id, a.targetIds],
      );
    }
    await client.query(
      'INSERT INTO announcement_reads (announcement_id, member_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
      [id, authorId],
    );
    await client.query('COMMIT');
    return id;
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

async function recipients(a, authorId) {
  if (a.audience === 'selected') return a.targetIds.filter((id) => id !== authorId);
  const { rows } = await query('SELECT id FROM members WHERE id <> $1', [authorId]);
  return rows.map((r) => r.id);
}

r.post('/announcements', requireAdmin, async (req, res) => {
  const a = parse(req.body);
  const id = await save(null, a, req.member.id);
  notifyMembers(await recipients(a, req.member.id), { title: `📢 ${a.title}`, body: a.text, url: '/' });
  res.status(201).json({ id });
});

r.put('/announcements/:id', requireAdmin, async (req, res) => {
  const a = parse(req.body);
  const id = await save(Number(req.params.id), a, req.member.id);
  notifyMembers(await recipients(a, req.member.id), { title: `📢 Updated: ${a.title}`, body: a.text, url: '/' });
  res.json({ id });
});

r.delete('/announcements/:id', requireAdmin, async (req, res) => {
  await query('DELETE FROM announcements WHERE id = $1', [Number(req.params.id)]);
  res.json({ ok: true });
});

export default r;
