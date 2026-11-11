import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api.js';
import { useAuth } from '../lib/auth.jsx';
import { PageHeader, ErrorText } from '../components/Layout.jsx';
import Avatar from '../components/Avatar.jsx';
import Icon from '../components/Icon.jsx';

export default function Family() {
  const { me } = useAuth();
  const [members, setMembers] = useState(null);
  const [q, setQ] = useState('');
  const [error, setError] = useState('');

  useEffect(() => { api('/members').then(setMembers).catch((e) => setError(e.message)); }, []);

  const shown = members?.filter((m) => `${m.name} ${m.relationship} ${m.phone}`.toLowerCase().includes(q.toLowerCase()));

  return (
    <>
      <PageHeader title="Family" subtitle={members ? `${members.length} members` : ''} />
      <div className="px-4">
        <input className="input mb-3" placeholder="Search name or relationship" value={q} onChange={(e) => setQ(e.target.value)} />
        <ErrorText>{error}</ErrorText>
        <ul className="card divide-y divide-line overflow-hidden">
          {shown?.map((m) => (
            <li key={m.id}>
              <Link to={`/family/${m.id}`} className="flex items-center gap-3 p-3 active:bg-brand-50">
                <Avatar member={m} />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold">{m.name}{m.id === me.id && <span className="ml-1 text-sm font-normal text-muted">(you)</span>}</p>
                  <p className="truncate text-sm text-muted">{m.relationship || m.phone || m.email || '—'}</p>
                </div>
                {m.phone && m.id !== me.id && (
                  <a href={`tel:${m.phone}`} onClick={(e) => e.stopPropagation()} className="rounded-full bg-emerald-50 p-2.5 text-emerald-700" aria-label={`Call ${m.name}`}>
                    <Icon name="phone" className="size-5" />
                  </a>
                )}
                <Icon name="chevron" className="size-5 text-muted/60" />
              </Link>
            </li>
          ))}
          {shown?.length === 0 && <li className="p-6 text-center text-muted">No one matches “{q}”.</li>}
        </ul>
      </div>
    </>
  );
}
