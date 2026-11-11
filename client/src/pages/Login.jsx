import { useEffect, useState } from 'react';
import { api } from '../lib/api.js';
import { useAuth } from '../lib/auth.jsx';
import PinPad, { PinDots } from '../components/PinPad.jsx';
import Avatar from '../components/Avatar.jsx';
import Icon from '../components/Icon.jsx';

const LAST = 'moim.lastMember';

export default function Login() {
  const { login, notice } = useAuth();
  const [members, setMembers] = useState(null);
  const [selected, setSelected] = useState(null);
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api('/auth/members').then((list) => {
      setMembers(list);
      let last;
      try { last = Number(localStorage.getItem(LAST)); } catch {}
      const m = list.find((x) => x.id === last);
      if (m) setSelected(m);
    }).catch((e) => setError(e.message));
  }, []);

  useEffect(() => {
    if (pin.length !== 4 || !selected) return;
    setBusy(true);
    setError('');
    login(selected.id, pin)
      .then(() => { try { localStorage.setItem(LAST, String(selected.id)); } catch {} })
      .catch((e) => { setError(e.message); setPin(''); })
      .finally(() => setBusy(false));
  }, [pin]);

  return (
    <div className="flex min-h-full flex-col">
    <div className="pt-safe relative overflow-hidden bg-gradient-to-br from-brand-500 via-brand-600 to-brand-900 pb-20 text-white">
      <div className="pointer-events-none absolute -top-24 -right-16 size-64 rounded-full bg-white/10 blur-2xl" />
      <div className="pointer-events-none absolute -bottom-20 -left-10 size-56 rounded-full bg-sky-300/20 blur-2xl" />
      <div className="relative px-6 pt-14 text-center">
        <div className="mx-auto mb-4 grid size-16 place-items-center rounded-2xl bg-white/15 ring-1 ring-white/25 backdrop-blur">
          <img src="/icon.svg" alt="" className="size-10" />
        </div>
        <h1 className="text-3xl font-bold tracking-tight">Moim</h1>
        <p className="mt-1 text-blue-100">Our family, together</p>
      </div>
    </div>
    <div className="pb-safe relative -mt-12 mx-auto flex w-full max-w-md flex-1 flex-col rounded-t-3xl bg-cream px-6 pt-6">

      {notice && !error && <p className="mb-4 rounded-xl bg-brand-50 px-4 py-3 text-center text-sm text-brand-700 ring-1 ring-brand-100">{notice}</p>}

      {!selected ? (
        <>
          <p className="mb-3 text-center font-semibold">Who are you?</p>
          {!members && !error && <p className="text-center text-muted">Loading…</p>}
          {error && <p className="mb-4 text-center text-sm text-red-700">{error}</p>}
          <div className="grid grid-cols-2 gap-3 pb-8">
            {members?.map((m) => (
              <button key={m.id} onClick={() => { setSelected(m); setError(''); }}
                className="card flex flex-col items-center gap-2 p-4 transition hover:-translate-y-0.5 hover:shadow-md hover:ring-brand-200 active:scale-[0.97]">
                <Avatar member={m} size="size-14" className="text-xl" />
                <span className="w-full truncate font-semibold">{m.name}</span>
              </button>
            ))}
          </div>
        </>
      ) : (
        <div className="flex flex-1 flex-col">
          <div className="mb-6 text-center">
            <Avatar member={selected} size="size-20" className="mx-auto mb-3 text-2xl" />
            <p className="text-lg font-semibold">Hi, {selected.name}</p>
            <p className="text-sm text-muted">Enter your 4-digit passcode</p>
          </div>
          <PinDots value={pin} error={!!error} />
          <p className="mt-4 h-5 text-center text-sm text-red-700">{error}</p>
          <div className="mt-4">
            <PinPad value={pin} onChange={setPin} disabled={busy} />
          </div>
          <button className="mx-auto mt-6 mb-8 flex items-center gap-1 text-sm font-semibold text-muted"
            onClick={() => { setSelected(null); setPin(''); setError(''); }}>
            <Icon name="back" className="size-4" /> Not {selected.name}?
          </button>
        </div>
      )}
    </div>
    </div>
  );
}
