import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, timeAgo } from '../lib/api.js';
import { useAuth } from '../lib/auth.jsx';
import { PageHeader, Empty, ErrorText } from '../components/Layout.jsx';
import Avatar from '../components/Avatar.jsx';
import Icon from '../components/Icon.jsx';
import Sheet from '../components/Sheet.jsx';

export default function Messages() {
  const { me } = useAuth();
  const navigate = useNavigate();
  const [convos, setConvos] = useState(null);
  const [members, setMembers] = useState([]);
  const [picking, setPicking] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const load = () => api('/conversations').then(setConvos).catch((e) => setError(e.message));
    load();
    const id = setInterval(load, 15000);
    const onSw = (e) => e.data?.type === 'moim-push' && load();
    navigator.serviceWorker?.addEventListener('message', onSw);
    return () => { clearInterval(id); navigator.serviceWorker?.removeEventListener('message', onSw); };
  }, []);

  const openPicker = () => {
    setPicking(true);
    api('/members').then((l) => setMembers(l.filter((m) => m.id !== me.id))).catch(() => {});
  };

  return (
    <>
      <PageHeader title="Messages" subtitle="Private, one-to-one"
        action={<button onClick={openPicker} className="btn rounded-full bg-white/10 px-3.5 py-2 text-sm text-white ring-1 ring-white/20 hover:bg-white/20"><Icon name="plus" className="size-4" />New</button>} />
      <div className="px-4">
        <ErrorText>{error}</ErrorText>
        {convos?.length === 0 && (
          <Empty icon="chat" title="No messages yet">
            <button className="font-semibold text-brand-600" onClick={openPicker}>Start a conversation</button>
          </Empty>
        )}
        {convos?.length > 0 && (
          <ul className="card divide-y divide-line overflow-hidden">
            {convos.map((c) => (
              <li key={c.member.id}>
                <Link to={`/messages/${c.member.id}`} className="flex items-center gap-3 p-3 active:bg-brand-50">
                  <Avatar member={c.member} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-2">
                      <p className={`truncate ${c.unread ? 'font-bold' : 'font-semibold'}`}>{c.member.name}</p>
                      <span className="shrink-0 text-xs text-muted">{timeAgo(c.last.createdAt)}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <p className={`flex-1 truncate text-sm ${c.unread ? 'font-semibold text-ink' : 'text-muted'}`}>
                        {c.last.fromMe && 'You: '}{c.last.body}
                      </p>
                      {c.unread > 0 && <span className="min-w-5 rounded-full bg-brand-600 px-1.5 text-center text-xs leading-5 font-bold text-white">{c.unread}</span>}
                    </div>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>

      <Sheet open={picking} onClose={() => setPicking(false)} title="Send a message to…">
        <ul className="space-y-1">
          {members.map((m) => (
            <li key={m.id}>
              <button onClick={() => navigate(`/messages/${m.id}`)} className="flex w-full items-center gap-3 rounded-xl p-2 text-left hover:bg-white">
                <Avatar member={m} size="size-10" />
                <div className="min-w-0">
                  <p className="truncate font-semibold">{m.name}</p>
                  <p className="truncate text-sm text-muted">{m.relationship}</p>
                </div>
              </button>
            </li>
          ))}
        </ul>
      </Sheet>
    </>
  );
}
