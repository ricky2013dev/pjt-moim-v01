import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../lib/api.js';
import { useBadges } from '../lib/badges.jsx';
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

export default function Thread() {
  const otherId = Number(useParams().id);
  const { refresh } = useBadges();
  const [other, setOther] = useState(null);
  const [msgs, setMsgs] = useState([]);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const bottom = useRef(null);
  const lastId = useRef(0);

  useEffect(() => {
    api('/members').then((l) => setOther(l.find((m) => m.id === otherId) || null)).catch(() => {});
    lastId.current = 0;
    setMsgs([]);
    let stop = false;
    const poll = async () => {
      try {
        const fresh = await api(`/conversations/${otherId}?after=${lastId.current}`);
        if (stop || !fresh.length) return;
        lastId.current = fresh[fresh.length - 1].id;
        setMsgs((cur) => [...cur, ...fresh.filter((f) => !cur.some((c) => c.id === f.id))]);
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
  }, [otherId]);

  useLayoutEffect(() => { bottom.current?.scrollIntoView({ block: 'end' }); }, [msgs.length]);

  const send = async (e) => {
    e.preventDefault();
    const body = text.trim();
    if (!body || sending) return;
    setSending(true);
    setError('');
    try {
      const m = await api(`/conversations/${otherId}`, { method: 'POST', body: { body } });
      lastId.current = Math.max(lastId.current, m.id);
      setMsgs((cur) => [...cur, m]);
      setText('');
    } catch (err) {
      setError(err.message);
    } finally {
      setSending(false);
    }
  };

  let lastDay = '';
  return (
    <div className="flex min-h-dvh flex-col">
      <PageHeader back="/messages"
        title={other ? <Link to={`/family/${other.id}`} className="flex items-center gap-2"><Avatar member={other} size="size-9" className="text-sm" /><span className="truncate text-xl">{other.name}</span></Link> : ''}
      />
      <div className="flex-1 space-y-1 px-4 pb-4">
        {msgs.length === 0 && other && <p className="py-12 text-center text-sm text-muted">Say hi to {other.name} 👋<br />Only the two of you can see these messages.</p>}
        {msgs.map((m) => {
          const day = dayLabel(m.createdAt);
          const showDay = day !== lastDay;
          lastDay = day;
          return (
            <div key={m.id}>
              {showDay && <p className="py-3 text-center text-xs font-semibold text-muted">{day}</p>}
              <div className={`flex ${m.fromMe ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[78%] rounded-2xl px-3.5 py-2 ${m.fromMe ? 'rounded-br-md bg-brand-600 text-white' : 'rounded-bl-md bg-white ring-1 ring-line'}`}>
                  <p className="whitespace-pre-wrap break-words">{m.body}</p>
                  <p className={`mt-0.5 text-right text-[10px] ${m.fromMe ? 'text-white/70' : 'text-muted'}`}>
                    {clock(m.createdAt)}{m.fromMe && m.readAt ? ' · Read' : ''}
                  </p>
                </div>
              </div>
            </div>
          );
        })}
        <div ref={bottom} />
      </div>
      <form onSubmit={send} className="sticky bottom-0 border-t border-line bg-cream/95 px-3 pt-2 backdrop-blur" style={{ paddingBottom: 'calc(0.5rem + env(safe-area-inset-bottom))' }}>
        {error && <div className="mb-2"><ErrorText>{error}</ErrorText></div>}
        <div className="flex items-end gap-2">
          <textarea rows={1} className="input max-h-32 min-h-12 resize-none py-3" placeholder="Message" value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing && window.matchMedia('(pointer: fine)').matches) send(e); }} />
          <button disabled={!text.trim() || sending} className="btn-primary size-12 shrink-0 rounded-full p-0" aria-label="Send">
            <Icon name="send" className="size-5" />
          </button>
        </div>
      </form>
    </div>
  );
}
