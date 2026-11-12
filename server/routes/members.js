import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { query, getSetting, setSetting } from '../db.js';
import { requireAuth, requireAdmin, isValidPasscode, setSession } from '../auth.js';
import { upload, savePhoto, removePhoto } from '../photos.js';

const r = Router();
r.use(requireAuth);

const COLS = 'id, name, phone, phone2, email, address, note, comment, role, photo_version, (photo IS NOT NULL) AS has_photo';

export function publicMember(m) {
  return {
    id: m.id,
    name: m.name,
    phone: m.phone,
    phone2: m.phone2,
    email: m.email,
    address: m.address,
    note: m.note,
    comment: m.comment,
    role: m.role,
    photoUrl: (m.has_photo ?? m.photo != null) ? `/api/members/${m.id}/photo?v=${m.photo_version}` : null,
  };
}

function clean(body, { requireName } = {}) {
  const out = {};
  for (const k of ['name', 'phone', 'phone2', 'email', 'address']) {
    if (body[k] !== undefined) out[k] = String(body[k]).trim().slice(0, 200);
  }
  for (const k of ['note', 'comment']) {
    if (body[k] !== undefined) out[k] = String(body[k]).trim().slice(0, 2000);
  }
  if ((requireName || out.name !== undefined) && !out.name) {
    const err = new Error('Name is required.');
    err.status = 400;
    throw err;
  }
  if (out.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(out.email)) {
    const err = new Error('That email address does not look right.');
    err.status = 400;
    throw err;
  }
  return out;
}

async function updateMember(id, fields) {
  const keys = Object.keys(fields);
  if (!keys.length) return;
  const sets = keys.map((k, i) => `${k} = $${i + 2}`).join(', ');
  await query(`UPDATE members SET ${sets}, updated_at = now() WHERE id = $1`, [id, ...keys.map((k) => fields[k])]);
}

async function getMember(id) {
  const { rows } = await query(`SELECT ${COLS} FROM members WHERE id = $1`, [id]);
  return rows[0] && publicMember(rows[0]);
}

async function setPasscode(id, hash) {
  await query(
    `UPDATE members SET passcode_hash = $2, passcode_version = passcode_version + 1,
       failed_logins = 0, locked_until = NULL, updated_at = now() WHERE id = $1`,
    [id, hash],
  );
}

// ---- Contacts ----
r.get('/members', async (_req, res) => {
  // sort_order is set by admins dragging the list; ties (e.g. before anyone has sorted) fall back to admins first, then name.
  const { rows } = await query(`SELECT ${COLS} FROM members ORDER BY sort_order, role = 'admin' DESC, name`);
  res.json(rows.map(publicMember));
});

r.get('/members/:id/photo', async (req, res) => {
  const { rows } = await query('SELECT photo, photo_mime FROM members WHERE id = $1', [Number(req.params.id)]);
  if (!rows[0]?.photo) return res.status(404).end();
  res.set('Content-Type', rows[0].photo_mime).set('Cache-Control', 'private, max-age=31536000, immutable');
  res.send(rows[0].photo);
});

// ---- My profile ----
r.patch('/me', async (req, res) => {
  await updateMember(req.member.id, clean(req.body || {}));
  res.json(await getMember(req.member.id));
});

r.put('/me/photo', upload.single('photo'), async (req, res) => {
  await savePhoto(req.member.id, req.file);
  res.json(await getMember(req.member.id));
});

r.delete('/me/photo', async (req, res) => {
  await removePhoto(req.member.id);
  res.json(await getMember(req.member.id));
});

r.post('/me/passcode', async (req, res) => {
  const { current, next } = req.body || {};
  if (!isValidPasscode(next)) return res.status(400).json({ error: 'New passcode must be 4 digits.' });
  const { rows } = await query('SELECT passcode_hash FROM members WHERE id = $1', [req.member.id]);
  if (!(await bcrypt.compare(String(current || ''), rows[0].passcode_hash))) {
    return res.status(400).json({ error: 'Current passcode is wrong.' });
  }
  await setPasscode(req.member.id, await bcrypt.hash(next, 10));
  // Keep this device signed in; other devices are signed out by the version bump.
  const { rows: fresh } = await query('SELECT id, passcode_version FROM members WHERE id = $1', [req.member.id]);
  setSession(res, fresh[0]);
  res.json({ ok: true });
});

r.post('/me/push-token', async (req, res) => {
  const token = String(req.body?.token || '');
  if (!token) return res.status(400).json({ error: 'Missing token' });
  await query(
    `INSERT INTO push_tokens (token, member_id) VALUES ($1, $2)
     ON CONFLICT (token) DO UPDATE SET member_id = EXCLUDED.member_id, created_at = now()`,
    [token, req.member.id],
  );
  res.json({ ok: true });
});

r.delete('/me/push-token', async (req, res) => {
  await query('DELETE FROM push_tokens WHERE token = $1 AND member_id = $2', [String(req.body?.token || ''), req.member.id]);
  res.json({ ok: true });
});

// ---- Admin: member management ----
r.post('/admin/members', requireAdmin, async (req, res) => {
  const fields = clean(req.body || {}, { requireName: true });
  const role = req.body?.role === 'admin' ? 'admin' : 'member';
  const hash = await getSetting('default_passcode_hash');
  const { rows } = await query(
    `INSERT INTO members (name, phone, phone2, email, address, note, comment, role, passcode_hash, sort_order)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, (SELECT COALESCE(MAX(sort_order), 0) + 1 FROM members)) RETURNING id`,
    [fields.name, fields.phone || '', fields.phone2 || '', fields.email || '',
      fields.address || '', fields.note || '', fields.comment || '', role, hash],
  );
  res.status(201).json(await getMember(rows[0].id));
});

// Saves the order the admin dragged the list into. ids is every member, top to bottom.
r.put('/admin/members/order', requireAdmin, async (req, res) => {
  const ids = Array.isArray(req.body?.ids) ? req.body.ids.map(Number) : [];
  if (!ids.length || ids.some((id) => !Number.isInteger(id)) || new Set(ids).size !== ids.length) {
    return res.status(400).json({ error: 'Send each member id once, in order.' });
  }
  await query(
    `UPDATE members m SET sort_order = x.ord FROM unnest($1::int[]) WITH ORDINALITY AS x(id, ord) WHERE m.id = x.id`,
    [ids],
  );
  res.json({ ok: true });
});

r.patch('/admin/members/:id', requireAdmin, async (req, res) => {
  const id = Number(req.params.id);
  const fields = clean(req.body || {});
  if (req.body?.role !== undefined) {
    const role = req.body.role === 'admin' ? 'admin' : 'member';
    if (role === 'member' && id === req.member.id) return res.status(400).json({ error: 'You cannot remove your own admin role.' });
    fields.role = role;
  }
  await updateMember(id, fields);
  const m = await getMember(id);
  if (!m) return res.status(404).json({ error: 'Member not found' });
  res.json(m);
});

r.delete('/admin/members/:id', requireAdmin, async (req, res) => {
  const id = Number(req.params.id);
  if (id === req.member.id) return res.status(400).json({ error: 'You cannot delete yourself.' });
  await query('DELETE FROM members WHERE id = $1', [id]);
  res.json({ ok: true });
});

r.put('/admin/members/:id/photo', requireAdmin, upload.single('photo'), async (req, res) => {
  await savePhoto(Number(req.params.id), req.file);
  res.json(await getMember(Number(req.params.id)));
});

r.delete('/admin/members/:id/photo', requireAdmin, async (req, res) => {
  await removePhoto(Number(req.params.id));
  res.json(await getMember(Number(req.params.id)));
});

// Set a specific passcode, or omit it to reset to the family default.
r.post('/admin/members/:id/passcode', requireAdmin, async (req, res) => {
  const id = Number(req.params.id);
  const { passcode } = req.body || {};
  let hash;
  if (passcode) {
    if (!isValidPasscode(passcode)) return res.status(400).json({ error: 'Passcode must be 4 digits.' });
    hash = await bcrypt.hash(passcode, 10);
  } else {
    hash = await getSetting('default_passcode_hash');
  }
  await setPasscode(id, hash);
  if (id === req.member.id) {
    const { rows } = await query('SELECT id, passcode_version FROM members WHERE id = $1', [id]);
    setSession(res, rows[0]);
  }
  res.json({ ok: true });
});

r.put('/admin/default-passcode', requireAdmin, async (req, res) => {
  const { passcode, applyToAll } = req.body || {};
  if (!isValidPasscode(passcode)) return res.status(400).json({ error: 'Passcode must be 4 digits.' });
  const hash = await bcrypt.hash(passcode, 10);
  await setSetting('default_passcode_hash', hash);
  let updated = 0;
  if (applyToAll) {
    const result = await query(
      `UPDATE members SET passcode_hash = $1, passcode_version = passcode_version + 1,
         failed_logins = 0, locked_until = NULL, updated_at = now() WHERE role = 'member'`,
      [hash],
    );
    updated = result.rowCount;
  }
  res.json({ ok: true, updated });
});

export default r;
