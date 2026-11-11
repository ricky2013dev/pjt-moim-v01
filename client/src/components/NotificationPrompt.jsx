import { useEffect, useState } from 'react';
import { enablePush, isIos, isStandalone, pushAvailable } from '../lib/push.js';
import Icon from './Icon.jsx';

const DISMISS = 'moim.notifDismissed';

// Gentle card on the News page asking to turn on notifications.
export default function NotificationPrompt() {
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const iosBrowser = isIos() && !isStandalone();

  useEffect(() => {
    let dismissed = false;
    try { dismissed = localStorage.getItem(DISMISS) === '1'; } catch {}
    if (dismissed) return;
    if (iosBrowser) return setShow(true);
    pushAvailable().then((ok) => setShow(ok && Notification.permission === 'default'));
  }, []);

  if (!show) return null;
  const dismiss = () => { try { localStorage.setItem(DISMISS, '1'); } catch {} setShow(false); };

  return (
    <div className="card flex gap-3 bg-brand-50 p-4 ring-brand-100">
      <div className="grid size-10 shrink-0 place-items-center rounded-full bg-white text-brand-600"><Icon name="bell" className="size-5" /></div>
      <div className="min-w-0 flex-1">
        {iosBrowser ? (
          <>
            <p className="font-semibold">Install Moim on your iPhone</p>
            <p className="text-sm text-muted">Tap <b>Share</b> then <b>Add to Home Screen</b> to get notifications.</p>
          </>
        ) : (
          <>
            <p className="font-semibold">Get notified</p>
            <p className="text-sm text-muted">Know right away when there’s family news or a message for you.</p>
          </>
        )}
        {error && <p className="mt-2 text-sm text-red-700">{error}</p>}
        <div className="mt-3 flex gap-2">
          {!iosBrowser && (
            <button className="btn-primary px-3 py-2 text-sm" disabled={busy}
              onClick={async () => { setBusy(true); setError(''); try { await enablePush(); setShow(false); } catch (e) { setError(e.message); } finally { setBusy(false); } }}>
              {busy ? 'Turning on…' : 'Turn on'}
            </button>
          )}
          <button className="btn px-3 py-2 text-sm text-muted" onClick={dismiss}>Not now</button>
        </div>
      </div>
    </div>
  );
}
