import { Router } from 'express';
import { query } from '../db.js';
import { requireAuth, requireAdmin } from '../auth.js';
import { notifyMembers } from '../push.js';

const r = Router();
r.use(requireAuth);

const MAX_HEADS = 50;
const bad = (msg) => Object.assign(new Error(msg), { status: 400 });

// Every event, with each member's answer (status is null when they haven't replied).
r.get('/events', async (_req, res) => {
  const { rows } = await query(
    `SELECT e.id, e.title, e.description, e.location, e.starts_at, e.created_at, e.updated_at,
            au.name AS author_name,
            COALESCE((
              SELECT json_agg(json_build_object(
                       'id', m.id, 'name', m.name, 'has_photo', m.photo IS NOT NULL, 'photo_version', m.photo_version,
                       'status', v.status, 'adults', COALESCE(v.adults, 0), 'kids', COALESCE(v.kids, 0),
                       'updated_at', v.updated_at)
                     ORDER BY m.sort_order, m.role = 'admin' DESC, m.name)
              FROM members m
              LEFT JOIN event_rsvps v ON v.event_id = e.id AND v.member_id = m.id
            ), '[]') AS responses
     FROM events e
     LEFT JOIN members au ON au.id = e.author_id
     ORDER BY e.starts_at DESC NULLS LAST, e.id DESC`,
  );
  res.json(rows.map((e) => ({
    ...e,
    responses: e.responses.map(({ has_photo, photo_version, ...m }) => ({
      ...m,
      photoUrl: has_photo ? `/api/members/${m.id}/photo?v=${photo_version}` : null,
    })),
  })));
});

function count(v, name) {
  const n = Number(v ?? 0);
  if (!Number.isInteger(n) || n < 0 || n > MAX_HEADS) throw bad(`${name} must be a whole number from 0 to ${MAX_HEADS}.`);
  return n;
}

// Members answer for themselves; admins can answer for (or clear) anyone.
async function rsvpTarget(req) {
  const id = req.body?.memberId ?? req.params.memberId;
  if (id === undefined || Number(id) === req.member.id) return req.member.id;
  if (req.member.role !== 'admin') throw Object.assign(new Error('Only admins can change someone else’s reply.'), { status: 403 });
  const { rowCount } = await query('SELECT 1 FROM members WHERE id = $1', [Number(id)]);
  if (!rowCount) throw Object.assign(new Error('Member not found'), { status: 404 });
  return Number(id);
}

r.put('/events/:id/rsvp', async (req, res) => {
  const memberId = await rsvpTarget(req);
  const status = req.body?.status;
  if (status !== 'going' && status !== 'not_going') throw bad('Choose going or not going.');
  const going = status === 'going';
  const adults = going ? count(req.body.adults, 'Adults') : 0;
  const kids = going ? count(req.body.kids, 'Kids') : 0;
  if (going && adults + kids === 0) throw bad('Add at least one person who is coming.');
  const { rowCount } = await query(
    `INSERT INTO event_rsvps (event_id, member_id, status, adults, kids)
     SELECT id, $2, $3, $4, $5 FROM events WHERE id = $1
     ON CONFLICT (event_id, member_id)
     DO UPDATE SET status = EXCLUDED.status, adults = EXCLUDED.adults, kids = EXCLUDED.kids, updated_at = now()`,
    [Number(req.params.id), memberId, status, adults, kids],
  );
  if (!rowCount) return res.status(404).json({ error: 'Event not found' });
  res.json({ ok: true });
});

// Back to "no reply".
r.delete('/events/:id/rsvp/:memberId', async (req, res) => {
  const memberId = await rsvpTarget(req);
  await query('DELETE FROM event_rsvps WHERE event_id = $1 AND member_id = $2', [Number(req.params.id), memberId]);
  res.json({ ok: true });
});

function parse(body) {
  const title = String(body?.title || '').trim().slice(0, 200);
  const description = String(body?.description || '').trim().slice(0, 5000);
  const location = String(body?.location || '').trim().slice(0, 300);
  let startsAt = null;
  if (body?.startsAt) {
    startsAt = new Date(body.startsAt);
    if (Number.isNaN(startsAt.getTime())) throw bad('That date does not look right.');
  }
  if (!title) throw bad('Title is required.');
  return { title, description, location, startsAt };
}

// The date label comes from the admin's browser so it's in the family's time zone, not the server's.
async function notifyAll(authorId, title, e, dateLabel) {
  const { rows } = await query('SELECT id FROM members WHERE id <> $1', [authorId]);
  const label = String(dateLabel || '').slice(0, 100);
  const body = [label, e.location].filter(Boolean).join(' · ') || 'Tap to let everyone know if you’re coming.';
  notifyMembers(rows.map((m) => m.id), { title, body, url: '/events' });
}

r.post('/events', requireAdmin, async (req, res) => {
  const e = parse(req.body);
  const { rows } = await query(
    `INSERT INTO events (title, description, location, starts_at, author_id) VALUES ($1, $2, $3, $4, $5) RETURNING id`,
    [e.title, e.description, e.location, e.startsAt, req.member.id],
  );
  notifyAll(req.member.id, `📅 ${e.title}`, e, req.body?.dateLabel);
  res.status(201).json({ id: rows[0].id });
});

r.put('/events/:id', requireAdmin, async (req, res) => {
  const e = parse(req.body);
  const { rowCount } = await query(
    `UPDATE events SET title = $2, description = $3, location = $4, starts_at = $5, updated_at = now() WHERE id = $1`,
    [Number(req.params.id), e.title, e.description, e.location, e.startsAt],
  );
  if (!rowCount) return res.status(404).json({ error: 'Event not found' });
  if (req.body?.notify) notifyAll(req.member.id, `📅 Updated: ${e.title}`, e, req.body?.dateLabel);
  res.json({ id: Number(req.params.id) });
});

r.delete('/events/:id', requireAdmin, async (req, res) => {
  await query('DELETE FROM events WHERE id = $1', [Number(req.params.id)]);
  res.json({ ok: true });
});

export default r;
