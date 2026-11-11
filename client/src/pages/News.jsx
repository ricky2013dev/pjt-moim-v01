import { useEffect, useState } from 'react';
import { api, timeAgo } from '../lib/api.js';
import { useAuth } from '../lib/auth.jsx';
import { useBadges } from '../lib/badges.jsx';
import { PageHeader, Empty, ErrorText } from '../components/Layout.jsx';
import NotificationPrompt from '../components/NotificationPrompt.jsx';

export default function News() {
  const { me } = useAuth();
  const { badges, refresh } = useBadges();
  const [items, setItems] = useState(null);
  const [error, setError] = useState('');

  // Load, then mark exactly what is now on screen as read.
  const load = () => api('/announcements')
    .then((list) => {
      setItems(list);
      const unread = list.filter((a) => !a.read).map((a) => a.id);
      if (unread.length) api('/announcements/read-all', { method: 'POST', body: { ids: unread } }).then(refresh).catch(() => {});
    })
    .catch((e) => setError(e.message));

  useEffect(() => {
    load();
    const onSw = (e) => e.data?.type === 'moim-push' && load();
    navigator.serviceWorker?.addEventListener('message', onSw);
    return () => navigator.serviceWorker?.removeEventListener('message', onSw);
  }, []);

  // The badge poll can spot new news before (or without) a push reaching this page.
  // Reload so the list matches the badge; load() marks them read, dropping the badge back to 0.
  useEffect(() => {
    if (badges.announcements > 0 && items) load();
  }, [badges.announcements]);

  return (
    <>
      <PageHeader title="Family News" subtitle={`Welcome back, ${me.name}`} showDate />
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
