import { useEffect, useState } from 'react';
import { api, mapUrl } from '../lib/api.js';
import { useAuth } from '../lib/auth.jsx';
import { useBadges } from '../lib/badges.jsx';
import { PageHeader, Empty, ErrorText } from '../components/Layout.jsx';
import Avatar from '../components/Avatar.jsx';
import Icon from '../components/Icon.jsx';
import Sheet, { Confirm } from '../components/Sheet.jsx';

const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const heads = (r) => [r.adults && plural(r.adults, 'adult'), r.kids && plural(r.kids, 'kid')].filter(Boolean).join(', ');

const fmtDate = (iso) => new Date(iso).toLocaleString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
const shortDate = (d) => d.toLocaleString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

// <input type="datetime-local"> wants local time without a zone: 2026-11-11T18:30.
function toLocalInput(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}

function totals(responses) {
  const going = responses.filter((r) => r.status === 'going');
  const adults = going.reduce((s, r) => s + r.adults, 0);
  const kids = going.reduce((s, r) => s + r.kids, 0);
  return {
    going,
    notGoing: responses.filter((r) => r.status === 'not_going'),
    noReply: responses.filter((r) => !r.status),
    adults, kids, total: adults + kids,
  };
}

export default function Events() {
  const { me } = useAuth();
  const isAdmin = me.role === 'admin';
  const [events, setEvents] = useState(null);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState(null); // null | 'new' | event
  const [deleting, setDeleting] = useState(null);
  const [showPast, setShowPast] = useState(false);

  const { badges, refresh } = useBadges();
  // Reloading also refreshes the tab badge, so it drops as soon as you reply.
  const load = () => api('/events').then((list) => { setEvents(list); refresh(); }).catch((e) => setError(e.message));
  useEffect(() => { load(); }, []);

  // The badge poll can spot a new event before this page has it; reload so they match.
  useEffect(() => { if (events && badges.events > 0) load(); }, [badges.events]); // eslint-disable-line react-hooks/exhaustive-deps

  // Events without a date, or later than the start of today, count as upcoming.
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const isUpcoming = (e) => !e.starts_at || new Date(e.starts_at) >= today;
  const upcoming = events?.filter(isUpcoming).sort((a, b) => (a.starts_at && b.starts_at ? new Date(a.starts_at) - new Date(b.starts_at) : a.starts_at ? -1 : b.starts_at ? 1 : b.id - a.id));
  const past = events?.filter((e) => !isUpcoming(e));

  const remove = async () => {
    try { await api(`/events/${deleting.id}`, { method: 'DELETE' }); setDeleting(null); load(); }
    catch (e) { setError(e.message); setDeleting(null); }
  };

  const card = (e) => <EventCard key={e.id} event={e} me={me} isAdmin={isAdmin} onChanged={load} onEdit={() => setEditing(e)} onDelete={() => setDeleting(e)} />;

  return (
    <>
      <PageHeader title="Events" subtitle="Who’s coming?" />
      <div className="space-y-3 px-4">
        {isAdmin && <button className="btn-primary w-full" onClick={() => setEditing('new')}><Icon name="plus" className="size-5" />New event</button>}
        <ErrorText>{error}</ErrorText>
        {events?.length === 0 && <Empty icon="calendar" title="No events yet">{isAdmin ? 'Create one and the family can RSVP.' : 'Family events will show up here.'}</Empty>}
        {upcoming?.map(card)}
        {past?.length > 0 && (
          <>
            <button className="flex w-full items-center justify-center gap-1 py-2 text-sm font-semibold text-muted" onClick={() => setShowPast(!showPast)}>
              {showPast ? 'Hide' : 'Show'} past events ({past.length})
              <Icon name="chevron" className={`size-4 transition ${showPast ? '-rotate-90' : 'rotate-90'}`} />
            </button>
            {showPast && past.map(card)}
          </>
        )}
      </div>
      {editing && <EventEditor target={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load(); }} />}
      <Confirm open={!!deleting} title="Delete event?" message={`“${deleting?.title}” and everyone’s replies will be removed.`}
        onCancel={() => setDeleting(null)} onConfirm={remove} />
    </>
  );
}

function EventCard({ event: e, me, isAdmin, onChanged, onEdit, onDelete }) {
  const t = totals(e.responses);
  const mine = e.responses.find((r) => r.id === me.id);
  const needsReply = mine && !mine.status && (!e.starts_at || new Date(e.starts_at) > new Date());
  const [editingPerson, setEditingPerson] = useState(null);
  const [listTab, setListTab] = useState('going');
  const lists = {
    going: { label: 'Going', people: t.going, on: 'bg-emerald-600 text-white', count: 'text-emerald-700', empty: 'No one has said they’re coming yet.' },
    not_going: { label: 'Not going', people: t.notGoing, on: 'bg-red-600 text-white', count: 'text-red-600', empty: 'No one has said they can’t come.' },
    none: { label: 'No reply', people: t.noReply, on: 'bg-slate-600 text-white', count: 'text-muted', empty: 'Everyone has replied.' },
  };
  const shown = lists[listTab];

  return (
    <article className={`card overflow-hidden ${needsReply ? 'ring-2 ring-amber-300' : ''}`}>
      <div className="p-4">
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            {needsReply && <span className="mb-1 inline-block rounded-full bg-amber-500 px-2 py-0.5 text-xs font-bold text-white">Please reply</span>}
            <h2 className="text-lg font-bold">{e.title}</h2>
          </div>
          {isAdmin && (
            <>
              <button className="rounded-full p-2 text-muted hover:bg-brand-50" onClick={onEdit} aria-label="Edit"><Icon name="edit" className="size-5" /></button>
              <button className="rounded-full p-2 text-red-600 hover:bg-red-50" onClick={onDelete} aria-label="Delete"><Icon name="trash" className="size-5" /></button>
            </>
          )}
        </div>
        <div className="mt-1 space-y-1 text-sm text-ink/80">
          {e.starts_at && <p className="flex items-center gap-2"><Icon name="calendar" className="size-4 text-muted" />{fmtDate(e.starts_at)}</p>}
          {e.location && (
            <a href={mapUrl(e.location)} target="_blank" rel="noreferrer" className="flex items-center gap-2 text-brand-700">
              <Icon name="map" className="size-4" /><span className="underline decoration-brand-200 underline-offset-2">{e.location}</span>
            </a>
          )}
        </div>
        {e.description && <p className="mt-2 whitespace-pre-wrap text-ink/80">{e.description}</p>}

        {/* Head count */}
        <div className="mt-4 grid grid-cols-3 gap-2 text-center">
          <Stat value={t.total} label="Total" strong />
          <Stat value={t.adults} label={t.adults === 1 ? 'Adult' : 'Adults'} />
          <Stat value={t.kids} label={t.kids === 1 ? 'Kid' : 'Kids'} />
        </div>

        {/* Keyed on the saved answer so it resets if an admin changes it from the list. */}
        {mine && <RsvpForm key={`${mine.status}-${mine.adults}-${mine.kids}`} event={e} person={mine} self onSaved={onChanged} />}
      </div>

      {/* Who's coming */}
      <div className="space-y-3 border-t border-line bg-cream/60 p-4">
        <div className="grid grid-cols-3 gap-1 rounded-xl bg-white p-1 ring-1 ring-line" role="tablist">
          {Object.entries(lists).map(([k, l]) => (
            <button key={k} type="button" role="tab" aria-selected={listTab === k} onClick={() => setListTab(k)}
              className={`rounded-lg px-1 py-2 text-sm font-semibold transition ${listTab === k ? `${l.on} shadow` : 'text-muted'}`}>
              {l.label} <span className={listTab === k ? 'text-white/85' : l.count}>{l.people.length}</span>
            </button>
          ))}
        </div>
        {isAdmin && shown.people.length > 0 && <p className="text-xs text-muted">Tap a name to change their reply.</p>}
        {shown.people.length
          ? <People people={shown.people} me={me} detail={listTab === 'going' ? heads : null} onPick={isAdmin && setEditingPerson} />
          : <p className="py-3 text-center text-sm text-muted">{shown.empty}</p>}
      </div>
      {editingPerson && (
        <Sheet open onClose={() => setEditingPerson(null)} title={`${editingPerson.name}’s reply`}>
          <div className="pb-2">
            <RsvpForm event={e} person={editingPerson} self={editingPerson.id === me.id}
              onSaved={async () => { await onChanged(); setEditingPerson(null); }} />
          </div>
        </Sheet>
      )}
    </article>
  );
}

function Stat({ value, label, strong }) {
  return (
    <div className={`rounded-xl py-2 ${strong ? 'bg-brand-600 text-white' : 'bg-brand-50 text-brand-700'}`}>
      <p className="text-2xl font-bold leading-tight">{value}</p>
      <p className={`text-xs font-semibold ${strong ? 'text-white/85' : ''}`}>{label}</p>
    </div>
  );
}

function People({ people, me, detail, onPick }) {
  return (
    <div>
      <ul className="space-y-0.5">
        {people.map((p) => (
          <li key={p.id}>
            {(() => {
              const row = (
                <>
                  <Avatar member={p} size="size-8" />
                  <span className="min-w-0 flex-1 truncate font-medium">{p.name}{p.id === me.id && <span className="ml-1 text-sm font-normal text-muted">(you)</span>}</span>
                  {detail && <span className="shrink-0 text-sm text-muted">{detail(p)}</span>}
                </>
              );
              return onPick ? (
                <button type="button" onClick={() => onPick(p)} className="-mx-2 flex w-[calc(100%+1rem)] items-center gap-3 rounded-xl px-2 py-1 text-left hover:bg-white active:bg-brand-50">
                  {row}<Icon name="edit" className="size-4 shrink-0 text-muted" />
                </button>
              ) : <div className="flex items-center gap-3 py-1">{row}</div>;
            })()}
          </li>
        ))}
      </ul>
    </div>
  );
}

function Stepper({ label, value, onChange }) {
  return (
    <div className="flex items-center justify-between rounded-xl bg-white p-2 pl-3 ring-1 ring-line">
      <span className="font-medium">{label}</span>
      <div className="flex items-center gap-2">
        <button type="button" className="grid size-9 place-items-center rounded-full bg-brand-50 text-brand-700 disabled:opacity-40" disabled={value <= 0}
          onClick={() => onChange(value - 1)} aria-label={`Fewer ${label.toLowerCase()}`}><Icon name="minus" className="size-4" /></button>
        <span className="w-6 text-center text-lg font-bold tabular-nums">{value}</span>
        <button type="button" className="grid size-9 place-items-center rounded-full bg-brand-50 text-brand-700 disabled:opacity-40" disabled={value >= 50}
          onClick={() => onChange(value + 1)} aria-label={`More ${label.toLowerCase()}`}><Icon name="plus" className="size-4" /></button>
      </div>
    </div>
  );
}

function RsvpForm({ event, person: mine, self, onSaved }) {
  const [status, setStatus] = useState(mine.status);
  const [adults, setAdults] = useState(mine.status === 'going' ? mine.adults : 1);
  const [kids, setKids] = useState(mine.status === 'going' ? mine.kids : 0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const changed = status !== mine.status || (status === 'going' && (adults !== mine.adults || kids !== mine.kids));

  const save = async () => {
    setBusy(true); setError('');
    try {
      await api(`/events/${event.id}/rsvp`, { method: 'PUT', body: { status, adults, kids, memberId: mine.id } });
      await onSaved();
    } catch (e) { setError(e.message); }
    finally { setBusy(false); }
  };

  const clear = async () => {
    setBusy(true); setError('');
    try {
      await api(`/events/${event.id}/rsvp/${mine.id}`, { method: 'DELETE' });
      await onSaved();
    } catch (e) { setError(e.message); }
    finally { setBusy(false); }
  };

  return (
    <div className="mt-4 space-y-3 rounded-2xl bg-cream p-3 ring-1 ring-line">
      <p className="text-sm font-semibold text-muted">{self ? 'Your family' : `${mine.name}’s family`}</p>
      <div className="grid grid-cols-2 gap-2">
        {[['going', 'Going', 'check', 'bg-emerald-600 text-white ring-emerald-600'], ['not_going', 'Not going', 'x', 'bg-red-600 text-white ring-red-600']].map(([k, l, icon, on]) => (
          <button key={k} type="button" onClick={() => setStatus(k)}
            className={`flex items-center justify-center gap-1.5 rounded-xl p-3 font-semibold ring-1 transition ${status === k ? on : 'bg-white ring-line'}`}>
            <Icon name={icon} className="size-4" />{l}
          </button>
        ))}
      </div>
      {status === 'going' && (
        <div className="space-y-2">
          <Stepper label="Adults" value={adults} onChange={setAdults} />
          <Stepper label="Kids" value={kids} onChange={setKids} />
        </div>
      )}
      <ErrorText>{error}</ErrorText>
      {changed && (
        <button className="btn-primary w-full" disabled={busy || (status === 'going' && adults + kids === 0)} onClick={save}>
          {busy ? 'Saving…' : self ? (mine.status ? 'Update my reply' : 'Send my reply') : `Save for ${mine.name}`}
        </button>
      )}
      {!changed && mine.status && (
        <p className="text-center text-sm text-emerald-700">
          <Icon name="check" className="mr-1 inline size-4" />
          {self
            ? (mine.status === 'going' ? `You’re coming with ${heads(mine)}.` : 'You said you can’t make it.')
            : (mine.status === 'going' ? `Coming with ${heads(mine)}.` : 'Not coming.')}
        </p>
      )}
      {!self && mine.status && (
        <button type="button" className="w-full text-center text-sm font-semibold text-muted" disabled={busy} onClick={clear}>Clear reply (back to no reply)</button>
      )}
    </div>
  );
}

function EventEditor({ target, onClose, onSaved }) {
  const isNew = target === 'new';
  const [form, setForm] = useState(() => ({
    title: isNew ? '' : target.title,
    startsAt: isNew ? '' : toLocalInput(target.starts_at),
    location: isNew ? '' : target.location,
    description: isNew ? '' : target.description,
  }));
  const [notify, setNotify] = useState(isNew);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const save = async (e) => {
    e.preventDefault();
    setBusy(true); setError('');
    try {
      const d = form.startsAt ? new Date(form.startsAt) : null;
      const body = { ...form, startsAt: d ? d.toISOString() : null, dateLabel: d ? shortDate(d) : '', notify };
      if (isNew) await api('/events', { method: 'POST', body });
      else await api(`/events/${target.id}`, { method: 'PUT', body });
      onSaved();
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  };

  return (
    <Sheet open onClose={onClose} title={isNew ? 'New event' : 'Edit event'}
      footer={<button form="event-form" className="btn-primary w-full" disabled={busy}>{busy ? 'Saving…' : isNew ? 'Create & notify' : 'Save'}</button>}>
      <form id="event-form" onSubmit={save} className="space-y-4 pb-2">
        <div><label className="label">Title *</label><input className="input" required value={form.title} onChange={set('title')} placeholder="e.g. Thanksgiving dinner" autoFocus={isNew} /></div>
        <div><label className="label">Date & time</label><input className="input" type="datetime-local" value={form.startsAt} onChange={set('startsAt')} /></div>
        <div><label className="label">Location</label><input className="input" value={form.location} onChange={set('location')} placeholder="Address or place" /></div>
        <div><label className="label">Details</label><textarea className="input min-h-28" value={form.description} onChange={set('description')} placeholder="What to bring, parking, etc." /></div>
        {!isNew && (
          <label className="flex items-center gap-3">
            <input type="checkbox" className="size-5 accent-brand-600" checked={notify} onChange={(e) => setNotify(e.target.checked)} />
            <span>Notify everyone about this change</span>
          </label>
        )}
        <ErrorText>{error}</ErrorText>
      </form>
    </Sheet>
  );
}
