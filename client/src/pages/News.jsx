import { useEffect, useState } from 'react';
import { api, timeAgo } from '../lib/api.js';
import { useAuth } from '../lib/auth.jsx';
import { useBadges } from '../lib/badges.jsx';
import { PageHeader, Empty, ErrorText } from '../components/Layout.jsx';
import NotificationPrompt from '../components/NotificationPrompt.jsx';

export default function News() {
  const { me } = useAuth();
  const { refresh } = useBadges();
  const [items, setItems] = useState(null);
  const [error, setError] = useState('');

  const load = () => api('/announcements').then(setItems).catch((e) => setError(e.message));

  useEffect(() => {
    load().then(() => api('/announcements/read-all', { method: 'POST' }).then(refresh).catch(() => {}));
    const onSw = (e) => e.data?.type === 'moim-push' && load();
    navigator.serviceWorker?.addEventListener('message', onSw);
    return () => navigator.serviceWorker?.removeEventListener('message', onSw);
  }, []);

  return (
    <>
      <PageHeader title="Family News" subtitle={`Welcome back, ${me.name}`} />
      <div className="space-y-3 px-4">
        <NotificationPrompt />
        <ErrorText>{error}</ErrorText>
        {items?.length === 0 && <Empty icon="megaphone" title="No announcements yet">News from the family will show up here.</Empty>}
        {items?.map((a) => (
          <article key={a.id} className={`card p-4 ${!a.read ? 'ring-2 ring-brand-200' : ''}`}>
            <div className="mb-1 flex items-center gap-2 text-xs text-muted">
              {!a.read && <span className="rounded-full bg-brand-600 px-2 py-0.5 font-bold text-white">NEW</span>}
              <span>{a.author_name || 'Admin'} · {timeAgo(a.updated_at)}</span>
              {a.updated_at !== a.created_at && <span>· edited</span>}
            </div>
            <h2 className="text-lg font-bold">{a.title}</h2>
            {a.body && <p className="mt-1 whitespace-pre-wrap text-ink/80">{a.body}</p>}
            {a.audience === 'selected' && (
              <p className="mt-3 text-xs text-muted">
                {me.role === 'admin' ? `Only for: ${a.targets.map((t) => t.name).join(', ')}` : 'Just for you'}
              </p>
            )}
          </article>
        ))}
      </div>
    </>
  );
}
