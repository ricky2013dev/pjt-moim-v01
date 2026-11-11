import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { api } from '../lib/api.js';
import { useBadges } from '../lib/badges.jsx';
import { useAuth } from '../lib/auth.jsx';
import { lockScroll } from '../components/Sheet.jsx';
import { PageHeader, ErrorText } from '../components/Layout.jsx';
import Avatar from '../components/Avatar.jsx';
import Icon from '../components/Icon.jsx';

const dayLabel = (iso) => {
  const d = new Date(iso);
  const today = new Date();
  const y = new Date(); y.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return 'Today';
  if (d.toDateString() === y.toDateString()) return 'Yesterday';
  return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
};
const clock = (iso) => new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
const FORMER = { name: 'Former member', photoUrl: null };

// Family group chat: one channel every member can read and post in.
export default function Messages() {
  const { refresh } = useBadges();
  const { me } = useAuth();
  const isAdmin = me?.role === 'admin';
  const [deleting, setDeleting] = useState(null);
  const [busy, setBusy] = useState(false);
  const [msgs, setMsgs] = useState(null);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const bottom = useRef(null);
  const lastId = useRef(0);
  const firstId = useRef(0);

  useEffect(() => {
    let stop = false;
    const poll = async () => {
      try {
        const from = firstId.current;
        const after = lastId.current;
        const res = await api(`/chat?after=${after}${from ? `&from=${from}` : ''}`);
        if (stop) return;
        const fresh = Array.isArray(res) ? res : res.messages;
        // Drop messages someone deleted since we loaded them.
        const live = Array.isArray(res) ? null : new Set(res.ids);
        const kept = (cur) => (live ? cur.filter((c) => c.id > after || live.has(c.id)) : cur);
        if (!fresh.length) { setMsgs((cur) => kept(cur || [])); return; }
        lastId.current = Math.max(lastId.current, fresh[fresh.length - 1].id);
        if (!firstId.current) firstId.current = fresh[0].id;
        setMsgs((cur) => {
          const base = kept(cur || []);
          return [...base, ...fresh.filter((f) => !base.some((c) => c.id === f.id))];
        });
        refresh();
      } catch (e) {
        if (!stop) setError(e.message);
      }
    };
    poll();
    const id = setInterval(poll, 4000);
    const onSw = (e) => e.data?.type === 'moim-push' && poll();
    navigator.serviceWorker?.addEventListener('message', onSw);
    return () => { stop = true; clearInterval(id); navigator.serviceWorker?.removeEventListener('message', onSw); };
  }, []);

  useLayoutEffect(() => { bottom.current?.scrollIntoView({ block: 'end' }); }, [msgs?.length]);

  const send = async (e) => {
    e.preventDefault();
    const body = text.trim();
    if (!body || sending) return;
    setSending(true);
    setError('');
    try {
      const m = await api('/chat', { method: 'POST', body: { body } });
      lastId.current = Math.max(lastId.current, m.id);
      setMsgs((cur) => (cur?.some((c) => c.id === m.id) ? cur : [...(cur || []), m]));
      setText('');
    } catch (err) {
      setError(err.message);
    } finally {
      setSending(false);
    }
  };

  const remove = async () => {
    setBusy(true);
    try {
      await api(`/chat/${deleting.id}`, { method: 'DELETE' });
      setMsgs((cur) => cur.filter((c) => c.id !== deleting.id));
      setDeleting(null);
    } catch (err) {
      setError(err.message);
      setDeleting(null);
    } finally {
      setBusy(false);
    }
  };

  let lastDay = '';
  let lastSender;
  return (
    <>
      <PageHeader title="Messages" subtitle="Family group chat · everyone can see" />
      <div className="space-y-0.5 px-4 pb-20">
        {msgs?.length === 0 && (
          <div className="py-16 text-center">
            <div className="mx-auto mb-4 grid size-16 place-items-center rounded-full bg-brand-50 text-brand-600">
              <Icon name="chat" className="size-8" />
            </div>
            <p className="font-semibold">No messages yet</p>
            <p className="text-sm text-muted">Say hi to the whole family 👋</p>
          </div>
        )}
        {msgs?.map((m) => {
          const day = dayLabel(m.createdAt);
          const showDay = day !== lastDay;
          const senderKey = m.sender?.id ?? 'former';
          const showName = !m.fromMe && (showDay || senderKey !== lastSender);
          lastDay = day;
          lastSender = senderKey;
          const sender = m.sender || FORMER;
          const canDelete = m.fromMe || isAdmin;
          return (
            <div key={m.id}>
              {showDay && <p className="py-3 text-center text-xs font-semibold text-muted">{day}</p>}
              <div className={`flex items-end gap-2 ${m.fromMe ? 'justify-end' : 'justify-start'} ${showName ? 'mt-2' : ''}`}>
                {!m.fromMe && (showName ? <Avatar member={sender} size="size-8" className="shrink-0 text-xs" /> : <span className="w-8 shrink-0" />)}
                <div className="max-w-[78%]">
                  {showName && <p className="mb-0.5 ml-1 text-xs font-semibold text-muted">{sender.name}</p>}
                  <div onClick={canDelete ? () => setDeleting(m) : undefined}
                    title={canDelete ? 'Tap to delete' : undefined}
                    className={`rounded-2xl px-3.5 py-2 ${m.fromMe ? 'rounded-br-md bg-yellow-300 text-ink' : 'rounded-bl-md bg-brand-600 text-white'} ${canDelete ? 'cursor-pointer select-text active:opacity-80' : ''}`}>
                    <p className="whitespace-pre-wrap break-words">{m.body}</p>
                    <p className={`mt-0.5 text-right text-[10px] ${m.fromMe ? 'text-ink/60' : 'text-white/70'}`}>{clock(m.createdAt)}</p>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
        <div ref={bottom} className="scroll-mb-48" />
      </div>

      {deleting && <DeleteSheet msg={deleting} busy={busy} onConfirm={remove} onCancel={() => setDeleting(null)} />}

      {/* Composer floats just above the bottom tab bar. */}
      <form onSubmit={send} className="fixed inset-x-0 z-30 px-3"
        style={{ bottom: 'calc(max(0.75rem, env(safe-area-inset-bottom)) + 4.75rem)' }}>
        <div className="mx-auto max-w-2xl">
          {error && <div className="mb-2"><ErrorText>{error}</ErrorText></div>}
          <div className="flex items-end gap-2 rounded-2xl bg-white/95 p-1.5 shadow-lg ring-1 ring-line backdrop-blur">
            <textarea rows={1} className="input max-h-32 min-h-11 resize-none py-2.5" placeholder="Message the family" value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing && window.matchMedia('(pointer: fine)').matches) send(e); }} />
            <button disabled={!text.trim() || sending} className="btn-primary size-11 shrink-0 rounded-full p-0" aria-label="Send">
              <Icon name="send" className="size-5" />
            </button>
          </div>
        </div>
      </form>
    </>
  );
}

// Confirms deleting one chat message, showing the message itself so it's clear which one.
function DeleteSheet({ msg, busy, onConfirm, onCancel }) {
  useEffect(() => lockScroll(), []);
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onCancel();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onCancel]);

  const who = msg.fromMe ? null : (msg.sender?.name || FORMER.name);
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center p-3 sm:items-center" role="dialog" aria-modal="true" aria-labelledby="del-title">
      <div className="absolute inset-0 bg-ink/45 backdrop-blur-sm" onClick={onCancel} />
      <div className="relative w-full max-w-sm rounded-3xl bg-white p-5 text-center shadow-2xl"
        style={{ marginBottom: 'env(safe-area-inset-bottom)' }}>
        <div className="mx-auto mb-3 grid size-12 place-items-center rounded-full bg-red-50 text-red-600">
          <Icon name="trash" className="size-6" />
        </div>
        <h2 id="del-title" className="text-lg font-bold">Delete this message?</h2>
        <p className="mt-1 text-sm text-muted">
          {who ? <>You’re removing <span className="font-semibold text-ink">{who}</span>’s message for everyone.</> : 'It will be removed for everyone in the family chat.'}
        </p>

        <div className={`my-4 flex ${msg.fromMe ? 'justify-end' : 'justify-start'} rounded-2xl bg-cream p-3`}>
          <div className={`max-w-[85%] rounded-2xl px-3.5 py-2 text-left ${msg.fromMe ? 'rounded-br-md bg-yellow-300 text-ink' : 'rounded-bl-md bg-brand-600 text-white'}`}>
            <p className="line-clamp-4 whitespace-pre-wrap break-words">{msg.body}</p>
            <p className={`mt-0.5 text-right text-[10px] ${msg.fromMe ? 'text-ink/60' : 'text-white/70'}`}>{clock(msg.createdAt)}</p>
          </div>
        </div>

        <div className="grid gap-2">
          <button className="btn w-full bg-red-600 text-white hover:bg-red-700" disabled={busy} onClick={onConfirm}>
            <Icon name="trash" className="size-5" />{busy ? 'Deleting…' : 'Delete for everyone'}
          </button>
          <button className="btn-ghost w-full" disabled={busy} onClick={onCancel}>Cancel</button>
        </div>
      </div>
    </div>
  );
}
