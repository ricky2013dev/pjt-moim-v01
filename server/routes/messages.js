import { Router } from 'express';
import { query } from '../db.js';
import { requireAuth } from '../auth.js';
import { notifyMembers } from '../push.js';
import { decryptText, encryptText } from '../crypto.js';

const r = Router();
r.use(requireAuth);

r.get('/badges', async (req, res) => {
  const me = req.member.id;
  const { rows } = await query(
    `SELECT
       (SELECT count(*)::int FROM chat_messages c
          WHERE c.id > COALESCE((SELECT last_read_id FROM chat_reads WHERE member_id = $1), 0)
            AND c.sender_id IS DISTINCT FROM $1) AS messages,
       (SELECT count(*)::int FROM announcements a
          WHERE (a.audience = 'all' OR EXISTS (SELECT 1 FROM announcement_targets t WHERE t.announcement_id = a.id AND t.member_id = $1))
            AND NOT EXISTS (SELECT 1 FROM announcement_reads rd WHERE rd.announcement_id = a.id AND rd.member_id = $1)
       ) AS announcements`,
    [me],
  );
  res.json(rows[0]);
});

function readBody(row) {
  try {
    return decryptText(row.body);
  } catch (err) {
    console.error(`Could not decrypt chat message ${row.id}:`, err.message);
    return '[This message could not be decrypted]';
  }
}

const toMessage = (row, me) => ({
  id: row.id,
  body: readBody(row),
  createdAt: row.created_at,
  fromMe: row.sender_id === me,
  sender: row.sender_id
    ? {
        id: row.sender_id,
        name: row.name,
        photoUrl: row.has_photo ? `/api/members/${row.sender_id}/photo?v=${row.photo_version}` : null,
      }
    : null,
});

// Family group chat: everyone sees every message. `after` fetches only newer ones.
// With `from` (the oldest id the client holds), the reply also lists which ids from
// `from` onward still exist, so clients can drop messages deleted since they loaded.
r.get('/chat', async (req, res) => {
  const me = req.member.id;
  const after = Number(req.query.after) || 0;
  const from = Number(req.query.from) || 0;
  const { rows } = await query(
    `SELECT c.id, c.sender_id, c.body, c.created_at,
            m.name, m.photo_version, (m.photo IS NOT NULL) AS has_photo
     FROM chat_messages c LEFT JOIN members m ON m.id = c.sender_id
     WHERE c.id > $1
     ORDER BY c.id DESC LIMIT 200`,
    [after],
  );
  if (rows.length) {
    await query(
      `INSERT INTO chat_reads (member_id, last_read_id) VALUES ($1, $2)
       ON CONFLICT (member_id) DO UPDATE SET last_read_id = GREATEST(chat_reads.last_read_id, EXCLUDED.last_read_id)`,
      [me, rows[0].id],
    );
  }
  const messages = rows.reverse().map((row) => toMessage(row, me));
  if (!from) return res.json(messages);
  const { rows: live } = await query(
    'SELECT id FROM chat_messages WHERE id >= $1 AND id <= $2 ORDER BY id',
    [from, after],
  );
  res.json({ messages, ids: live.map((l) => l.id) });
});

// A message can be deleted by whoever sent it, or by an admin.
r.delete('/chat/:id', async (req, res) => {
  const id = Number(req.params.id);
  const { rows } = await query('SELECT sender_id FROM chat_messages WHERE id = $1', [id]);
  if (!rows.length) return res.status(404).json({ error: 'Message not found.' });
  if (rows[0].sender_id !== req.member.id && req.member.role !== 'admin') {
    return res.status(403).json({ error: 'You can only delete your own messages.' });
  }
  await query('DELETE FROM chat_messages WHERE id = $1', [id]);
  res.json({ ok: true });
});

r.post('/chat', async (req, res) => {
  const me = req.member;
  const body = String(req.body?.body || '').trim().slice(0, 4000);
  if (!body) return res.status(400).json({ error: 'Message is empty.' });
  const { rows } = await query(
    `INSERT INTO chat_messages (sender_id, body) VALUES ($1, $2) RETURNING id, sender_id, body, created_at`,
    [me.id, encryptText(body)],
  );
  const { rows: others } = await query('SELECT id FROM members WHERE id <> $1', [me.id]);
  notifyMembers(others.map((o) => o.id), { title: `💬 ${me.name}`, body, url: '/messages' });
  const { rows: sender } = await query(
    'SELECT name, photo_version, (photo IS NOT NULL) AS has_photo FROM members WHERE id = $1',
    [me.id],
  );
  res.status(201).json(toMessage({ ...rows[0], ...sender[0] }, me.id));
});

export default r;
