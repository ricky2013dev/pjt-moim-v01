import jwt from 'jsonwebtoken';
import { query } from './db.js';

const SECRET = process.env.JWT_SECRET || process.env.SESSION_SECRET;
if (!SECRET || SECRET === 'change-me') {
  if (process.env.NODE_ENV === 'production') throw new Error('Set a strong JWT_SECRET.');
  console.warn('WARNING: JWT_SECRET is not set to a strong value.');
}

export const COOKIE = 'moim_session';
const ONE_YEAR = 365 * 24 * 60 * 60 * 1000;

// The token carries the passcode version. Changing a passcode bumps the
// version, which signs out every device still holding the old token.
export function setSession(res, member) {
  const token = jwt.sign({ sub: member.id, pv: member.passcode_version }, SECRET || 'dev-secret', {
    expiresIn: '365d',
  });
  res.cookie(COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: ONE_YEAR,
    path: '/',
  });
}

export function clearSession(res) {
  res.clearCookie(COOKIE, { path: '/' });
}

export async function requireAuth(req, res, next) {
  const token = req.cookies?.[COOKIE];
  if (!token) return res.status(401).json({ error: 'Not signed in' });
  let payload;
  try {
    payload = jwt.verify(token, SECRET || 'dev-secret');
  } catch {
    clearSession(res);
    return res.status(401).json({ error: 'Session expired' });
  }
  const { rows } = await query(
    `SELECT id, name, relationship, phone, email, role, passcode_version, photo_version,
       (photo IS NOT NULL) AS has_photo
     FROM members WHERE id = $1`,
    [payload.sub],
  );
  const member = rows[0];
  if (!member || member.passcode_version !== payload.pv) {
    clearSession(res);
    return res.status(401).json({ error: 'Passcode changed. Please sign in again.' });
  }
  req.member = member;
  next();
}

export function requireAdmin(req, res, next) {
  if (req.member?.role !== 'admin') return res.status(403).json({ error: 'Admins only' });
  next();
}

export const isValidPasscode = (p) => typeof p === 'string' && /^\d{4}$/.test(p);
