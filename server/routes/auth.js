import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { query } from '../db.js';
import { setSession, clearSession, requireAuth } from '../auth.js';
import { webPushConfig } from '../push.js';
import { publicMember } from './members.js';

const r = Router();
const MAX_FAILS = 5;
const LOCK_MINUTES = 5;

// Names only, for the "who are you?" picker on the sign-in screen.
r.get('/auth/members', async (_req, res) => {
  const { rows } = await query(`SELECT id, name, relationship FROM members ORDER BY role = 'admin' DESC, name`);
  res.json(rows);
});

r.post('/auth/login', async (req, res) => {
  const { memberId, passcode } = req.body || {};
  const { rows } = await query('SELECT * FROM members WHERE id = $1', [Number(memberId)]);
  const m = rows[0];
  if (!m || typeof passcode !== 'string') return res.status(400).json({ error: 'Choose your name and enter your passcode.' });

  if (m.locked_until && new Date(m.locked_until) > new Date()) {
    const mins = Math.ceil((new Date(m.locked_until) - Date.now()) / 60000);
    return res.status(429).json({ error: `Too many tries. Try again in ${mins} minute${mins > 1 ? 's' : ''}.` });
  }

  if (!(await bcrypt.compare(passcode, m.passcode_hash))) {
    const fails = m.failed_logins + 1;
    const lock = fails >= MAX_FAILS;
    await query(
      `UPDATE members SET failed_logins = $2, locked_until = CASE WHEN $3 THEN now() + make_interval(mins => $4) ELSE NULL END WHERE id = $1`,
      [m.id, lock ? 0 : fails, lock, LOCK_MINUTES],
    );
    return res.status(401).json({
      error: lock ? `Too many tries. Try again in ${LOCK_MINUTES} minutes.` : `Wrong passcode. ${MAX_FAILS - fails} tries left.`,
    });
  }

  await query('UPDATE members SET failed_logins = 0, locked_until = NULL WHERE id = $1', [m.id]);
  setSession(res, m);
  res.json(publicMember(m));
});

r.post('/auth/logout', async (req, res) => {
  const token = req.body?.pushToken;
  if (token) await query('DELETE FROM push_tokens WHERE token = $1', [token]);
  clearSession(res);
  res.json({ ok: true });
});

r.get('/auth/me', requireAuth, (req, res) => res.json(publicMember(req.member)));

r.get('/config', (_req, res) => res.json({ push: webPushConfig() }));

export default r;
