import { query } from './db.js';

let messaging = null;

function parseServiceAccount(raw) {
  if (!raw) return null;
  const text = raw.trim().startsWith('{') ? raw : Buffer.from(raw, 'base64').toString('utf8');
  return JSON.parse(text);
}

export async function initPush() {
  const account = parseServiceAccount(process.env.FIREBASE_SERVICE_ACCOUNT);
  if (!account) {
    console.log('Push notifications disabled (FIREBASE_SERVICE_ACCOUNT not set).');
    return;
  }
  const { initializeApp, cert } = await import('firebase-admin/app');
  const { getMessaging } = await import('firebase-admin/messaging');
  initializeApp({ credential: cert(account) });
  messaging = getMessaging();
  console.log('Push notifications enabled.');
}

export function webPushConfig() {
  const e = process.env;
  if (!e.FIREBASE_API_KEY || !e.FIREBASE_VAPID_KEY || !e.FIREBASE_MESSAGING_SENDER_ID) return null;
  return {
    firebase: {
      apiKey: e.FIREBASE_API_KEY,
      authDomain: e.FIREBASE_AUTH_DOMAIN,
      projectId: e.FIREBASE_PROJECT_ID,
      storageBucket: e.FIREBASE_STORAGE_BUCKET,
      messagingSenderId: e.FIREBASE_MESSAGING_SENDER_ID,
      appId: e.FIREBASE_APP_ID,
    },
    vapidKey: e.FIREBASE_VAPID_KEY,
  };
}

// Sends a data-only message; the service worker builds the notification so
// it can open the right page when tapped.
export async function notifyMembers(memberIds, { title, body, url }) {
  if (!messaging || !memberIds.length) return;
  const { rows } = await query('SELECT token FROM push_tokens WHERE member_id = ANY($1::int[])', [memberIds]);
  const tokens = rows.map((r) => r.token);
  if (!tokens.length) return;

  try {
    for (let i = 0; i < tokens.length; i += 500) {
      const batch = tokens.slice(i, i + 500);
      const res = await messaging.sendEachForMulticast({
        tokens: batch,
        data: { title, body: body.slice(0, 200), url },
        webpush: { headers: { Urgency: 'high' } },
      });
      const dead = res.responses
        .map((r, idx) => (!r.success && /registration-token-not-registered|invalid-argument/.test(r.error?.code || '') ? batch[idx] : null))
        .filter(Boolean);
      if (dead.length) await query('DELETE FROM push_tokens WHERE token = ANY($1::text[])', [dead]);
    }
  } catch (err) {
    console.error('Push send failed:', err.message);
  }
}
