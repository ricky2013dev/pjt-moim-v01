import { api } from './api.js';

const TOKEN_KEY = 'moim.pushToken';
let cfgPromise;

export const pushSupported = () =>
  'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;

export const isIos = () => /iphone|ipad|ipod/i.test(navigator.userAgent);
export const isStandalone = () =>
  window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;

async function config() {
  cfgPromise ||= api('/config').then((c) => c.push).catch(() => null);
  return cfgPromise;
}

export async function pushAvailable() {
  return pushSupported() && !!(await config());
}

export const savedToken = () => {
  try { return localStorage.getItem(TOKEN_KEY); } catch { return null; }
};

// Asks permission (must be called from a tap), gets an FCM token, and stores it on the server.
export async function enablePush() {
  const cfg = await config();
  if (!cfg) throw new Error('Push notifications are not set up on the server yet.');
  if (!pushSupported()) {
    throw new Error(isIos() && !isStandalone()
      ? 'On iPhone, first tap Share → "Add to Home Screen", then open Moim from your home screen.'
      : 'This browser does not support notifications.');
  }
  const perm = await Notification.requestPermission();
  if (perm !== 'granted') throw new Error('Notifications are blocked. Allow them in your browser settings.');

  const [{ initializeApp, getApps }, { getMessaging, getToken }] = await Promise.all([
    import('firebase/app'),
    import('firebase/messaging'),
  ]);
  const app = getApps()[0] || initializeApp(cfg.firebase);
  const registration = await navigator.serviceWorker.ready;
  const token = await getToken(getMessaging(app), { vapidKey: cfg.vapidKey, serviceWorkerRegistration: registration });
  if (!token) throw new Error('Could not get a notification token.');
  await api('/me/push-token', { method: 'POST', body: { token } });
  try { localStorage.setItem(TOKEN_KEY, token); } catch {}
  return token;
}

// Re-register silently on launch if permission was already granted (tokens can rotate).
export async function refreshPush() {
  if (!(await pushAvailable()) || Notification.permission !== 'granted') return;
  try { await enablePush(); } catch (e) { console.warn('Push refresh failed', e); }
}

export async function disablePush() {
  const token = savedToken();
  try { localStorage.removeItem(TOKEN_KEY); } catch {}
  if (token) await api('/me/push-token', { method: 'DELETE', body: { token } }).catch(() => {});
  return token;
}
