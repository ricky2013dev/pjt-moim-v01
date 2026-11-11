import { Router } from 'express';
import { query } from '../db.js';
import { requireAuth } from '../auth.js';
import { notifyMembers } from '../push.js';

const r = Router();
r.use(requireAuth);

r.get('/badges', async (req, res) => {
  const me = req.member.id;
  const { rows } = await query(
    `SELECT
       (SELECT count(*)::int FROM messages WHERE recipient_id = $1 AND read_at IS NULL) AS messages,
       (SELECT count(*)::int FROM announcements a
          WHERE (a.audience = 'all' OR EXISTS (SELECT 1 FROM announcement_targets t WHERE t.announcement_id = a.id AND t.member_id = $1))
            AND NOT EXISTS (SELECT 1 FROM announcement_reads rd WHERE rd.announcement_id = a.id AND rd.member_id = $1)
       ) AS announcements`,
    [me],
  );
  res.json(rows[0]);
});

// One row per person I've talked with: their latest message and my unread count.
r.get('/conversations', async (req, res) => {
  const { rows } = await query(
    `SELECT DISTINCT ON (other_id) other_id, m.name, m.relationship, m.photo_version, (m.photo IS NOT NULL) AS has_photo,
            x.body, x.created_at, x.sender_id,
            (SELECT count(*)::int FROM messages u WHERE u.sender_id = other_id AND u.recipient_id = $1 AND u.read_at IS NULL) AS unread
     FROM (SELECT *, CASE WHEN sender_id = $1 THEN recipient_id ELSE sender_id END AS other_id
           FROM messages WHERE sender_id = $1 OR recipient_id = $1) x
     JOIN members m ON m.id = x.other_id
     ORDER BY other_id, x.created_at DESC`,
    [req.member.id],
  );
  rows.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  res.json(
    rows.map((c) => ({
      member: {
        id: c.other_id,
        name: c.name,
        relationship: c.relationship,
        photoUrl: c.has_photo ? `/api/members/${c.other_id}/photo?v=${c.photo_version}` : null,
      },
      last: { body: c.body, createdAt: c.created_at, fromMe: c.sender_id === req.member.id },
      unread: c.unread,
    })),
  );
});

r.get('/conversations/:memberId', async (req, res) => {
  const me = req.member.id;
  const other = Number(req.params.memberId);
  const after = Number(req.query.after) || 0;
  await query('UPDATE messages SET read_at = now() WHERE sender_id = $1 AND recipient_id = $2 AND read_at IS NULL', [other, me]);
  const { rows } = await query(
    `SELECT id, sender_id, body, created_at, read_at FROM messages
     WHERE ((sender_id = $1 AND recipient_id = $2) OR (sender_id = $2 AND recipient_id = $1)) AND id > $3
     ORDER BY id DESC LIMIT 200`,
    [me, other, after],
  );
  res.json(rows.reverse().map((m) => ({ id: m.id, fromMe: m.sender_id === me, body: m.body, createdAt: m.created_at, readAt: m.read_at })));
});

r.post('/conversations/:memberId', async (req, res) => {
  const other = Number(req.params.memberId);
  const body = String(req.body?.body || '').trim().slice(0, 4000);
  if (!body) return res.status(400).json({ error: 'Message is empty.' });
  if (other === req.member.id) return res.status(400).json({ error: 'You cannot message yourself.' });
  const { rowCount } = await query('SELECT 1 FROM members WHERE id = $1', [other]);
  if (!rowCount) return res.status(404).json({ error: 'Member not found' });
  const { rows } = await query(
    `INSERT INTO messages (sender_id, recipient_id, body) VALUES ($1, $2, $3) RETURNING id, body, created_at`,
    [req.member.id, other, body],
  );
  notifyMembers([other], { title: `💬 ${req.member.name}`, body, url: `/messages/${req.member.id}` });
  res.status(201).json({ id: rows[0].id, fromMe: true, body: rows[0].body, createdAt: rows[0].created_at, readAt: null });
});

export default r;
