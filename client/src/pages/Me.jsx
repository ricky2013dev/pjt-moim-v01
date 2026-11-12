import { useEffect, useRef, useState } from 'react';
import { api, uploadPhoto, formatPhone } from '../lib/api.js';
import { useAuth } from '../lib/auth.jsx';
import { disablePush, enablePush, isIos, isStandalone, pushAvailable, savedToken } from '../lib/push.js';
import { PageHeader, ErrorText } from '../components/Layout.jsx';
import Avatar from '../components/Avatar.jsx';
import Icon from '../components/Icon.jsx';
import Sheet from '../components/Sheet.jsx';
import { PinInput } from '../components/PinPad.jsx';

export function PhotoPicker({ member, onUpload, onRemove }) {
  const ref = useRef(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const run = async (fn) => { setBusy(true); setError(''); try { await fn(); } catch (e) { setError(e.message); } finally { setBusy(false); } };
  return (
    <div className="text-center">
      <button type="button" onClick={() => ref.current?.click()} className="relative mx-auto block" disabled={busy}>
        <Avatar member={member} size="size-28" className={`text-4xl shadow-md ${busy ? 'opacity-50' : ''}`} />
        <span className="absolute right-0 bottom-0 grid size-9 place-items-center rounded-full bg-brand-600 text-white ring-4 ring-cream">
          <Icon name="camera" className="size-4" />
        </span>
      </button>
      <input ref={ref} type="file" accept="image/*" hidden
        onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) run(() => onUpload(f)); }} />
      {member?.photoUrl && onRemove && (
        <button type="button" className="mt-2 text-sm font-semibold text-muted" disabled={busy} onClick={() => run(onRemove)}>Remove photo</button>
      )}
      {busy && <p className="mt-2 text-sm text-muted">Uploading…</p>}
      {error && <p className="mt-2 text-sm text-red-700">{error}</p>}
    </div>
  );
}

function NotificationsRow() {
  const [state, setState] = useState('loading');
  const [error, setError] = useState('');
  useEffect(() => {
    pushAvailable().then((ok) => {
      if (!ok) return setState(isIos() && !isStandalone() ? 'ios' : 'unavailable');
      setState(Notification.permission === 'granted' && savedToken() ? 'on' : Notification.permission === 'denied' ? 'blocked' : 'off');
    });
  }, []);
  const toggle = async () => {
    setError('');
    try {
      if (state === 'on') { await disablePush(); setState('off'); }
      else { setState('loading'); await enablePush(); setState('on'); }
    } catch (e) { setError(e.message); setState('off'); }
  };
  const hint = {
    ios: 'Add Moim to your Home Screen first (Share → Add to Home Screen).',
    unavailable: 'Not available on this device or not set up yet.',
    blocked: 'Blocked in your browser settings.',
  }[state];
  return (
    <div className="p-4">
      <div className="flex items-center gap-3">
        <Icon name="bell" className="size-5 text-muted" />
        <span className="flex-1 font-medium">Notifications</span>
        {['on', 'off', 'loading'].includes(state) && (
          <button onClick={toggle} disabled={state === 'loading'} role="switch" aria-checked={state === 'on'}
            className={`relative h-7 w-12 rounded-full transition ${state === 'on' ? 'bg-brand-600' : 'bg-line'}`}>
            <span className={`absolute top-0.5 size-6 rounded-full bg-white shadow transition-all ${state === 'on' ? 'left-[22px]' : 'left-0.5'}`} />
          </button>
        )}
      </div>
      {(hint || error) && <p className={`mt-2 text-sm ${error ? 'text-red-700' : 'text-muted'}`}>{error || hint}</p>}
    </div>
  );
}

export default function Me() {
  const { me, setMe, logout } = useAuth();
  const [form, setForm] = useState({ name: me.name, phone: me.phone, phone2: me.phone2 || '', email: me.email, address: me.address, note: me.note, comment: me.comment });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');
  const [pinOpen, setPinOpen] = useState(false);

  const dirty = Object.keys(form).some((k) => form[k] !== me[k]);
  const save = async (e) => {
    e.preventDefault();
    setSaving(true); setError(''); setSaved(false);
    try { setMe(await api('/me', { method: 'PATCH', body: form })); setSaved(true); }
    catch (err) { setError(err.message); }
    finally { setSaving(false); }
  };

  return (
    <>
      <PageHeader title="Me" />
      <div className="space-y-5 px-4">
        <PhotoPicker member={me}
          onUpload={async (f) => setMe(await uploadPhoto('/me/photo', f))}
          onRemove={async () => setMe(await api('/me/photo', { method: 'DELETE' }))} />

        <form onSubmit={save} className="card space-y-4 p-4">
          <div><label className="label">Name</label><input className="input" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
          <div><label className="label">Phone</label><input className="input" type="tel" inputMode="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: formatPhone(e.target.value) })} placeholder="214-555-1234" /></div>
          <div><label className="label">Phone 2</label><input className="input" type="tel" inputMode="tel" value={form.phone2} onChange={(e) => setForm({ ...form, phone2: formatPhone(e.target.value) })} placeholder="Optional second number" /></div>
          <div><label className="label">Email</label><input className="input" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="you@example.com" /></div>
          <div><label className="label">Address</label><input className="input" autoComplete="street-address" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} placeholder="Street, city" /></div>
          <div><label className="label">Note</label><textarea className="input min-h-20" rows={3} value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} /></div>
          <div><label className="label">Comment</label><textarea className="input min-h-20" rows={3} value={form.comment} onChange={(e) => setForm({ ...form, comment: e.target.value })} /></div>
          <ErrorText>{error}</ErrorText>
          <button className="btn-primary w-full" disabled={!dirty || saving}>{saving ? 'Saving…' : saved && !dirty ? <><Icon name="check" className="size-5" />Saved</> : 'Save changes'}</button>
        </form>

        <div className="card divide-y divide-line">
          <button onClick={() => setPinOpen(true)} className="flex w-full items-center gap-3 p-4 text-left">
            <Icon name="lock" className="size-5 text-muted" />
            <span className="flex-1 font-medium">Change passcode</span>
            <Icon name="chevron" className="size-5 text-muted/60" />
          </button>
          <NotificationsRow />
          <button onClick={logout} className="flex w-full items-center gap-3 p-4 text-left text-red-700">
            <Icon name="logout" className="size-5" />
            <span className="flex-1 font-medium">Sign out</span>
          </button>
        </div>
      </div>
      <ChangePasscode open={pinOpen} onClose={() => setPinOpen(false)} />
    </>
  );
}

function ChangePasscode({ open, onClose }) {
  const [cur, setCur] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => { if (open) { setCur(''); setNext(''); setConfirm(''); setError(''); setDone(false); } }, [open]);

  const submit = async (e) => {
    e.preventDefault();
    if (next !== confirm) return setError('New passcodes don’t match.');
    setBusy(true); setError('');
    try { await api('/me/passcode', { method: 'POST', body: { current: cur, next } }); setDone(true); }
    catch (err) { setError(err.message); }
    finally { setBusy(false); }
  };

  return (
    <Sheet open={open} onClose={onClose} title="Change passcode">
      {done ? (
        <div className="py-6 text-center">
          <div className="mx-auto mb-3 grid size-14 place-items-center rounded-full bg-emerald-50 text-emerald-700"><Icon name="check" className="size-7" /></div>
          <p className="font-semibold">Passcode changed</p>
          <p className="text-sm text-muted">You stay signed in here. Other devices will need the new passcode.</p>
          <button className="btn-primary mt-5 w-full" onClick={onClose}>Done</button>
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-4 pb-2">
          <div><label className="label">Current passcode</label><PinInput value={cur} onChange={setCur} autoFocus /></div>
          <div><label className="label">New passcode</label><PinInput value={next} onChange={setNext} /></div>
          <div><label className="label">Confirm new passcode</label><PinInput value={confirm} onChange={setConfirm} /></div>
          <ErrorText>{error}</ErrorText>
          <button className="btn-primary w-full" disabled={busy || cur.length < 4 || next.length < 4 || confirm.length < 4}>{busy ? 'Saving…' : 'Change passcode'}</button>
        </form>
      )}
    </Sheet>
  );
}
