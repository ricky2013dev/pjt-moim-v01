import { useEffect, useState } from 'react';
import { api, timeAgo, uploadPhoto } from '../lib/api.js';
import { useAuth } from '../lib/auth.jsx';
import { PageHeader, Empty, ErrorText } from '../components/Layout.jsx';
import Avatar from '../components/Avatar.jsx';
import Icon from '../components/Icon.jsx';
import Sheet, { Confirm } from '../components/Sheet.jsx';
import { PinInput } from '../components/PinPad.jsx';
import { PhotoPicker } from './Me.jsx';

const TABS = [['members', 'Members'], ['news', 'News'], ['passcode', 'Passcodes']];

export default function Admin() {
  const [tab, setTab] = useState(() => sessionStorage.getItem('moim.adminTab') || 'members');
  const [members, setMembers] = useState(null);
  const loadMembers = () => api('/members').then(setMembers);
  useEffect(() => { loadMembers(); }, []);
  const pick = (t) => { setTab(t); try { sessionStorage.setItem('moim.adminTab', t); } catch {} };

  return (
    <>
      <PageHeader title="Admin" subtitle="Manage the family" />
      <div className="px-4">
        <div className="mb-4 grid grid-cols-3 rounded-xl bg-white p-1 ring-1 ring-line">
          {TABS.map(([k, label]) => (
            <button key={k} onClick={() => pick(k)}
              className={`rounded-lg py-2 text-sm font-semibold transition ${tab === k ? 'bg-brand-600 text-white shadow' : 'text-muted'}`}>{label}</button>
          ))}
        </div>
        {tab === 'members' && <MembersTab members={members} reload={loadMembers} />}
        {tab === 'news' && <NewsTab members={members} />}
        {tab === 'passcode' && <PasscodeTab />}
      </div>
    </>
  );
}

// ---------------- Members ----------------
function MembersTab({ members, reload }) {
  const [editing, setEditing] = useState(null); // null | 'new' | member
  return (
    <>
      <button className="btn-primary mb-3 w-full" onClick={() => setEditing('new')}><Icon name="plus" className="size-5" />Add family member</button>
      <ul className="card divide-y divide-line overflow-hidden">
        {members?.map((m) => (
          <li key={m.id}>
            <button className="flex w-full items-center gap-3 p-3 text-left active:bg-brand-50" onClick={() => setEditing(m)}>
              <Avatar member={m} />
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold">
                  {m.name}
                  {m.role === 'admin' && <span className="ml-2 rounded-full bg-brand-50 px-2 py-0.5 text-xs font-bold text-brand-700">Admin</span>}
                </p>
                <p className="truncate text-sm text-muted">{[m.relationship, m.phone].filter(Boolean).join(' · ') || '—'}</p>
              </div>
              <Icon name="edit" className="size-5 text-muted" />
            </button>
          </li>
        ))}
      </ul>
      <MemberEditor key={editing?.id || editing} target={editing} onClose={() => setEditing(null)} reload={reload} />
    </>
  );
}

function MemberEditor({ target, onClose, reload }) {
  const { me, setMe } = useAuth();
  const isNew = target === 'new';
  const [member, setMember] = useState(isNew ? null : target);
  const [form, setForm] = useState(() => ({
    name: target?.name || '', relationship: target?.relationship || '', phone: target?.phone || '', email: target?.email || '', role: target?.role || 'member',
  }));
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [pin, setPin] = useState('');
  const [pinMsg, setPinMsg] = useState('');

  if (!target) return null;
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  const isSelf = member?.id === me.id;

  const syncSelf = (m) => { if (m.id === me.id) setMe(m); };

  const save = async (e) => {
    e.preventDefault();
    setBusy(true); setError('');
    try {
      const m = isNew
        ? await api('/admin/members', { method: 'POST', body: form })
        : await api(`/admin/members/${member.id}`, { method: 'PATCH', body: form });
      syncSelf(m);
      await reload();
      onClose();
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  };

  const remove = async () => {
    setBusy(true);
    try { await api(`/admin/members/${member.id}`, { method: 'DELETE' }); await reload(); onClose(); }
    catch (err) { setError(err.message); setConfirmDelete(false); }
    finally { setBusy(false); }
  };

  const setPasscode = async (reset) => {
    setPinMsg(''); setError('');
    try {
      await api(`/admin/members/${member.id}/passcode`, { method: 'POST', body: reset ? {} : { passcode: pin } });
      setPin('');
      setPinMsg(reset ? 'Reset to the family default passcode.' : 'Passcode updated.');
    } catch (err) { setError(err.message); }
  };

  const photoChanged = async (m) => { setMember(m); syncSelf(m); await reload(); };

  return (
    <>
      <Sheet open onClose={onClose} title={isNew ? 'Add family member' : `Edit ${member.name}`}
        footer={
          <div className="flex gap-3">
            {!isNew && !isSelf && <button type="button" className="btn-danger px-3" onClick={() => setConfirmDelete(true)} aria-label="Delete"><Icon name="trash" className="size-5" /></button>}
            <button form="member-form" className="btn-primary flex-1" disabled={busy}>{busy ? 'Saving…' : isNew ? 'Add member' : 'Save'}</button>
          </div>
        }>
        <div className="space-y-5 pb-2">
          {!isNew && (
            <PhotoPicker member={member}
              onUpload={async (f) => photoChanged(await uploadPhoto(`/admin/members/${member.id}/photo`, f))}
              onRemove={async () => photoChanged(await api(`/admin/members/${member.id}/photo`, { method: 'DELETE' }))} />
          )}
          <form id="member-form" onSubmit={save} className="space-y-4">
            <div><label className="label">Name *</label><input className="input" required value={form.name} onChange={set('name')} placeholder="e.g. Grandma Kim" autoFocus={isNew} /></div>
            <div><label className="label">Relationship</label><input className="input" value={form.relationship} onChange={set('relationship')} placeholder="e.g. Grandmother, Son, Aunt" list="relationships" /></div>
            <datalist id="relationships">
              {['Father', 'Mother', 'Son', 'Daughter', 'Grandfather', 'Grandmother', 'Brother', 'Sister', 'Uncle', 'Aunt', 'Cousin', 'Spouse'].map((r) => <option key={r} value={r} />)}
            </datalist>
            <div><label className="label">Phone</label><input className="input" type="tel" inputMode="tel" value={form.phone} onChange={set('phone')} /></div>
            <div><label className="label">Email</label><input className="input" type="email" value={form.email} onChange={set('email')} /></div>
            <label className={`flex items-center gap-3 ${isSelf ? 'opacity-50' : ''}`}>
              <input type="checkbox" className="size-5 accent-brand-600" disabled={isSelf} checked={form.role === 'admin'}
                onChange={(e) => setForm({ ...form, role: e.target.checked ? 'admin' : 'member' })} />
              <span>Admin (can manage members and announcements)</span>
            </label>
            {isNew && <p className="rounded-xl bg-brand-50 px-4 py-3 text-sm text-brand-700">They’ll sign in with the family default passcode (see Passcodes tab) and can change it later. Add a photo after saving.</p>}
          </form>

          {!isNew && (
            <div className="card space-y-3 p-4">
              <p className="flex items-center gap-2 font-semibold"><Icon name="key" className="size-5 text-muted" />Passcode</p>
              <div className="flex gap-2">
                <PinInput value={pin} onChange={setPin} placeholder="••••" />
                <button type="button" className="btn-ghost shrink-0" disabled={pin.length !== 4} onClick={() => setPasscode(false)}>Set</button>
              </div>
              <button type="button" className="text-sm font-semibold text-brand-600" onClick={() => setPasscode(true)}>Reset to family default</button>
              {pinMsg && <p className="text-sm text-emerald-700">{pinMsg} {isSelf ? '' : 'They’ll need to sign in again.'}</p>}
            </div>
          )}
          <ErrorText>{error}</ErrorText>
        </div>
      </Sheet>
      <Confirm open={confirmDelete} busy={busy} title={`Delete ${member?.name}?`}
        message="This removes their profile, photo and messages. This can’t be undone."
        onCancel={() => setConfirmDelete(false)} onConfirm={remove} />
    </>
  );
}

// ---------------- Announcements ----------------
function NewsTab({ members }) {
  const [items, setItems] = useState(null);
  const [editing, setEditing] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [error, setError] = useState('');
  const load = () => api('/announcements').then(setItems).catch((e) => setError(e.message));
  useEffect(() => { load(); }, []);

  const remove = async () => {
    try { await api(`/announcements/${deleting.id}`, { method: 'DELETE' }); setDeleting(null); load(); }
    catch (e) { setError(e.message); setDeleting(null); }
  };

  return (
    <>
      <button className="btn-primary mb-3 w-full" onClick={() => setEditing('new')}><Icon name="megaphone" className="size-5" />New announcement</button>
      <ErrorText>{error}</ErrorText>
      {items?.length === 0 && <Empty icon="megaphone" title="No announcements">Post one and everyone gets notified.</Empty>}
      <div className="space-y-3">
        {items?.map((a) => (
          <div key={a.id} className="card p-4">
            <div className="flex items-start gap-2">
              <div className="min-w-0 flex-1">
                <p className="font-bold">{a.title}</p>
                <p className="text-xs text-muted">{timeAgo(a.updated_at)} · {a.audience === 'all' ? 'Everyone' : a.targets.map((t) => t.name).join(', ')}</p>
              </div>
              <button className="rounded-full p-2 text-muted hover:bg-brand-50" onClick={() => setEditing(a)} aria-label="Edit"><Icon name="edit" className="size-5" /></button>
              <button className="rounded-full p-2 text-red-600 hover:bg-red-50" onClick={() => setDeleting(a)} aria-label="Delete"><Icon name="trash" className="size-5" /></button>
            </div>
            {a.body && <p className="mt-2 line-clamp-3 whitespace-pre-wrap text-sm text-ink/80">{a.body}</p>}
          </div>
        ))}
      </div>
      {editing && <AnnouncementEditor target={editing} members={members || []} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load(); }} />}
      <Confirm open={!!deleting} title="Delete announcement?" message={`“${deleting?.title}” will be removed for everyone.`}
        onCancel={() => setDeleting(null)} onConfirm={remove} />
    </>
  );
}

function AnnouncementEditor({ target, members, onClose, onSaved }) {
  const { me } = useAuth();
  const isNew = target === 'new';
  const [title, setTitle] = useState(isNew ? '' : target.title);
  const [body, setBody] = useState(isNew ? '' : target.body);
  const [audience, setAudience] = useState(isNew ? 'all' : target.audience);
  const [ids, setIds] = useState(() => new Set(isNew ? [] : target.targets.map((t) => t.id)));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const others = members.filter((m) => m.id !== me.id);

  const toggle = (id) => setIds((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const save = async (e) => {
    e.preventDefault();
    setBusy(true); setError('');
    try {
      const payload = { title, body, audience, targetIds: [...ids] };
      if (isNew) await api('/announcements', { method: 'POST', body: payload });
      else await api(`/announcements/${target.id}`, { method: 'PUT', body: payload });
      onSaved();
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  };

  return (
    <Sheet open onClose={onClose} title={isNew ? 'New announcement' : 'Edit announcement'}
      footer={<button form="ann-form" className="btn-primary w-full" disabled={busy}>{busy ? 'Sending…' : isNew ? 'Post & notify' : 'Update & notify'}</button>}>
      <form id="ann-form" onSubmit={save} className="space-y-4 pb-2">
        <div><label className="label">Title *</label><input className="input" required value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Family dinner this Sunday" autoFocus /></div>
        <div><label className="label">Message</label><textarea className="input min-h-32" value={body} onChange={(e) => setBody(e.target.value)} placeholder="Details…" /></div>
        <div>
          <label className="label">Send to</label>
          <div className="grid grid-cols-2 gap-2">
            {[['all', 'Everyone'], ['selected', 'Specific people']].map(([k, l]) => (
              <button key={k} type="button" onClick={() => setAudience(k)}
                className={`rounded-xl p-3 font-semibold ring-1 transition ${audience === k ? 'bg-brand-50 text-brand-700 ring-brand-500' : 'bg-white ring-line'}`}>{l}</button>
            ))}
          </div>
        </div>
        {audience === 'selected' && (
          <ul className="card divide-y divide-line">
            {others.map((m) => (
              <li key={m.id}>
                <label className="flex items-center gap-3 p-3">
                  <input type="checkbox" className="size-5 accent-brand-600" checked={ids.has(m.id)} onChange={() => toggle(m.id)} />
                  <Avatar member={m} size="size-9" className="text-sm" />
                  <span className="flex-1 font-medium">{m.name}</span>
                  <span className="text-sm text-muted">{m.relationship}</span>
                </label>
              </li>
            ))}
          </ul>
        )}
        <ErrorText>{error}</ErrorText>
      </form>
    </Sheet>
  );
}

// ---------------- Passcodes ----------------
function PasscodeTab() {
  const [pin, setPin] = useState('');
  const [applyAll, setApplyAll] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');

  const save = async () => {
    setBusy(true); setError(''); setMsg('');
    try {
      const r = await api('/admin/default-passcode', { method: 'PUT', body: { passcode: pin, applyToAll: applyAll } });
      setMsg(applyAll ? `Saved. ${r.updated} member${r.updated === 1 ? '' : 's'} reset — they’ll sign in with ${pin}.` : 'Default passcode saved for new members.');
      setPin(''); setApplyAll(false);
    } catch (e) { setError(e.message); }
    finally { setBusy(false); setConfirming(false); }
  };

  return (
    <div className="card space-y-4 p-4">
      <div>
        <p className="font-bold">Family default passcode</p>
        <p className="text-sm text-muted">New members sign in with this 4-digit passcode until they change it.</p>
      </div>
      <PinInput value={pin} onChange={setPin} placeholder="••••" />
      <label className="flex items-start gap-3">
        <input type="checkbox" className="mt-0.5 size-5 accent-brand-600" checked={applyAll} onChange={(e) => setApplyAll(e.target.checked)} />
        <span><b>Also reset every member</b> to this passcode<br /><span className="text-sm text-muted">Admins keep theirs. Everyone else is signed out.</span></span>
      </label>
      {msg && <p className="rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{msg}</p>}
      <ErrorText>{error}</ErrorText>
      <button className="btn-primary w-full" disabled={pin.length !== 4 || busy} onClick={() => (applyAll ? setConfirming(true) : save())}>
        {busy ? 'Saving…' : 'Save default passcode'}
      </button>
      <p className="text-sm text-muted">To change one person’s passcode, open them in the Members tab.</p>
      <Confirm open={confirming} busy={busy} title="Reset everyone’s passcode?" confirmLabel="Reset all"
        message={`All non-admin members will need to sign in again with ${pin}.`} onCancel={() => setConfirming(false)} onConfirm={save} />
    </div>
  );
}
