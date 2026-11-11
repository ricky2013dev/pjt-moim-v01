import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api, mapUrl } from '../lib/api.js';
import { useAuth } from '../lib/auth.jsx';
import { PageHeader, ErrorText } from '../components/Layout.jsx';
import Avatar from '../components/Avatar.jsx';
import Icon from '../components/Icon.jsx';

function Action({ href, to, icon, label, tint }) {
  const cls = `flex flex-col items-center gap-1.5 rounded-2xl p-3 text-sm font-semibold ${tint}`;
  const inner = <><Icon name={icon} className="size-6" />{label}</>;
  return to ? <Link to={to} className={cls}>{inner}</Link> : <a href={href} className={cls}>{inner}</a>;
}

export default function MemberDetail() {
  const { id } = useParams();
  const { me } = useAuth();
  const [m, setM] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api('/members').then((list) => {
      const found = list.find((x) => x.id === Number(id));
      found ? setM(found) : setError('Member not found.');
    }).catch((e) => setError(e.message));
  }, [id]);

  const isMe = m?.id === me.id;
  return (
    <>
      <PageHeader title="" back="/family" />
      <div className="px-4">
        <ErrorText>{error}</ErrorText>
        {m && (
          <>
            <div className="mb-6 text-center">
              <Avatar member={m} size="size-28" className="mx-auto mb-3 text-4xl shadow-md" />
              <h1 className="text-2xl font-bold">{m.name}</h1>
            </div>
            {!isMe && (
              <div className="mb-6 grid grid-cols-3 gap-2">
                {m.phone ? <Action href={`tel:${m.phone}`} icon="phone" label="Call" tint="bg-emerald-50 text-emerald-700" /> : <span />}
                {m.phone ? <Action href={`sms:${m.phone}`} icon="sms" label="Text" tint="bg-sky-50 text-sky-700" /> : <span />}
                {m.email ? <Action href={`mailto:${m.email}`} icon="mail" label="Email" tint="bg-violet-50 text-violet-700" /> : <span />}
              </div>
            )}
            <dl className="card divide-y divide-line">
              {[['Phone', m.phone], ['Email', m.email]].map(([k, v]) => (
                <div key={k} className="flex justify-between gap-4 p-4">
                  <dt className="text-muted">{k}</dt>
                  <dd className="truncate text-right font-medium">{v || '—'}</dd>
                </div>
              ))}
              <div className="flex justify-between gap-4 p-4">
                <dt className="text-muted">Address</dt>
                <dd className="text-right font-medium">
                  {m.address ? (
                    <a href={mapUrl(m.address)} target="_blank" rel="noreferrer" className="inline-flex items-start gap-1 text-brand-700">
                      <Icon name="map" className="mt-0.5 size-4 shrink-0" />{m.address}
                    </a>
                  ) : '—'}
                </dd>
              </div>
            </dl>
            {[['Note', m.note], ['Comment', m.comment]].filter(([, v]) => v).map(([k, v]) => (
              <div key={k} className="card mt-3 p-4">
                <p className="mb-1 text-sm text-muted">{k}</p>
                <p className="whitespace-pre-wrap">{v}</p>
              </div>
            ))}
            {isMe && <Link to="/me" className="btn-ghost mt-4 w-full">Edit my info</Link>}
          </>
        )}
      </div>
    </>
  );
}
