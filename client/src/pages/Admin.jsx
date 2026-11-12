import { useEffect, useRef, useState } from 'react';
import { api, timeAgo, uploadPhoto, formatPhone, cleanPhone, phonesOf } from '../lib/api.js';
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
  const [order, setOrder] = useState(null); // shown order while a drag result is being saved
  const [error, setError] = useState('');
  const list = order || members;

  const saveOrder = async (next) => {
    setOrder(next); setError('');
    try { await api('/admin/members/order', { method: 'PUT', body: { ids: next.map((m) => m.id) } }); await reload(); }
    catch (e) { setError(e.message); }
    finally { setOrder(null); }
  };
  const drag = useDragSort(list, saveOrder);

  return (
    <>
      <button className="btn-primary mb-3 w-full" onClick={() => setEditing('new')}><Icon name="plus" className="size-5" />Add family member</button>
      <p className="mb-2 flex items-center gap-1 text-xs text-muted"><Icon name="grip" className="size-4" strokeWidth={3} />Drag to set the order everyone sees.</p>
      <ErrorText>{error}</ErrorText>
      <ul className="card divide-y divide-line">
        {list?.map((m, i) => (
          <li key={m.id} ref={drag.rowRef(i)} style={drag.style(i)}
            className={`relative bg-white first:rounded-t-2xl last:rounded-b-2xl ${drag.active === i ? 'z-10 shadow-xl ring-2 ring-brand-500' : ''}`}>
            <div className="flex items-center">
            <span {...drag.handle(i)} className="grid h-full cursor-grab touch-none place-items-center self-stretch py-3 pr-1 pl-3 text-muted/70 active:cursor-grabbing" aria-label={`Drag to move ${m.name}`}>
              <Icon name="grip" className="size-5" strokeWidth={3} />
            </span>
            <button className="flex min-w-0 flex-1 items-center gap-3 py-3 pr-3 pl-1 text-left active:bg-brand-50" onClick={() => setEditing(m)}>
              <Avatar member={m} />
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold">
                  {m.name}
                  {m.role === 'admin' && <span className="ml-2 rounded-full bg-brand-50 px-2 py-0.5 text-xs font-bold text-brand-700">Admin</span>}
                </p>
                <p className="truncate text-sm text-muted">{[m.phone, m.phone2].filter(Boolean).join(' · ') || m.email || '—'}</p>
              </div>
              <Icon name="edit" className="size-5 text-muted" />
            </button>
            </div>
          </li>
        ))}
      </ul>
      <MemberEditor key={editing?.id || editing} target={editing} onClose={() => setEditing(null)} reload={reload} />
    </>
  );
}

// Drag-to-reorder for a vertical list, with mouse or touch, started from a handle.
// Rows don't move in the DOM while dragging: the dragged row follows the pointer and the
// rows it passes slide out of the way. The new order is handed to onDrop on release.
function useDragSort(items, onDrop) {
  const rows = useRef([]);
  const st = useRef(null);
  const [drag, setDrag] = useState(null); // { from, to, dy, h }

  // Page-space position of the pointer, so scrolling during a drag is accounted for.
  const pageY = (clientY) => clientY + window.scrollY;

  const update = () => {
    const s = st.current;
    if (!s) return;
    const dy = pageY(s.clientY) - s.startY;
    const center = s.rects[s.from].top + s.rects[s.from].h / 2 + dy;
    let to = 0;
    s.rects.forEach((r, i) => { if (i !== s.from && r.top + r.h / 2 < center) to += 1; });
    s.last = { from: s.from, to, dy, h: s.rects[s.from].h };
    setDrag(s.last);
  };

  // Scroll the page while the pointer is held near the top or bottom edge.
  const autoScroll = () => {
    const s = st.current;
    if (!s) return;
    const edge = s.clientY < 150 ? -1 : s.clientY > window.innerHeight - 140 ? 1 : 0;
    if (edge) { window.scrollBy(0, edge * 10); update(); }
    s.raf = requestAnimationFrame(autoScroll);
  };

  const end = (commit) => {
    const s = st.current;
    if (!s) return;
    cancelAnimationFrame(s.raf);
    st.current = null;
    setDrag(null);
    const d = s.last;
    if (commit && d && d.to !== d.from) {
      const next = [...items];
      next.splice(d.to, 0, next.splice(d.from, 1)[0]);
      onDrop(next);
    }
  };

  useEffect(() => () => st.current && cancelAnimationFrame(st.current.raf), []);

  return {
    active: drag?.from,
    rowRef: (i) => (el) => { rows.current[i] = el; },
    handle: (i) => ({
      onPointerDown: (e) => {
        if (e.button !== 0) return;
        e.preventDefault();
        e.currentTarget.setPointerCapture(e.pointerId);
        const rects = items.map((_, j) => {
          const r = rows.current[j].getBoundingClientRect();
          return { top: pageY(r.top), h: r.height };
        });
        st.current = { from: i, rects, startY: pageY(e.clientY), clientY: e.clientY };
        st.current.raf = requestAnimationFrame(autoScroll);
        update();
      },
      onPointerMove: (e) => { if (st.current) { st.current.clientY = e.clientY; update(); } },
      onPointerUp: () => end(true),
      onPointerCancel: () => end(false),
    }),
    style: (i) => {
      if (!drag) return undefined;
      const { from, to, dy, h } = drag;
      if (i === from) return { transform: `translateY(${dy}px)` };
      const shift = from < to && i > from && i <= to ? -h : to < from && i >= to && i < from ? h : 0;
      return { transform: `translateY(${shift}px)`, transition: 'transform 150ms ease' };
    },
  };
}

function MemberEditor({ target, onClose, reload }) {
  const { me, setMe } = useAuth();
  const isNew = target === 'new';
  const [member, setMember] = useState(isNew ? null : target);
  const [form, setForm] = useState(() => ({
    name: target?.name || '', phone: target?.phone || '', phone2: target?.phone2 || '', email: target?.email || '', address: target?.address || '', note: target?.note || '', comment: target?.comment || '', role: target?.role || 'member',
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
            <div><label className="label">Phone</label><input className="input" type="tel" inputMode="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: formatPhone(e.target.value) })} placeholder="214-555-1234" /></div>
            <div><label className="label">Phone 2</label><input className="input" type="tel" inputMode="tel" value={form.phone2} onChange={(e) => setForm({ ...form, phone2: formatPhone(e.target.value) })} placeholder="Optional second number" /></div>
            <div><label className="label">Email</label><input className="input" type="email" value={form.email} onChange={set('email')} /></div>
            <div><label className="label">Address</label><input className="input" value={form.address} onChange={set('address')} placeholder="Street, city" /></div>
            <div><label className="label">Note</label><textarea className="input min-h-20" rows={3} value={form.note} onChange={set('note')} /></div>
            <div><label className="label">Comment</label><textarea className="input min-h-20" rows={3} value={form.comment} onChange={set('comment')} /></div>
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

// Opens the phone's Messages app with every recipient and the text pre-filled.
// iOS needs the "/open?addresses=" form for more than one recipient.
function smsUrl(numbers, text) {
  const body = encodeURIComponent(text);
  if (/iphone|ipad|ipod|macintosh/i.test(navigator.userAgent)) return `sms:/open?addresses=${numbers.join(',')}&body=${body}`;
  return `sms:${numbers.join(',')}?body=${body}`;
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
  // One entry per number, so a member with two phones can be texted on either or both.
  const withPhone = others.flatMap((m) => phonesOf(m).map((p, i) => ({ key: `${m.id}:${i}`, member: m, ...p, primary: i === 0 })));

  const [sendSms, setSendSms] = useState(false);
  const [smsIds, setSmsIds] = useState(() => new Set(withPhone.filter((p) => p.primary).map((p) => p.key))); // first number of each member
  const [extra, setExtra] = useState([]); // manually entered numbers
  const [manual, setManual] = useState('');
  const [smsLink, setSmsLink] = useState(null); // set after posting, when SMS is on

  const toggle = (id) => setIds((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const toggleSms = (id) => setSmsIds((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const addManual = () => {
    const nums = manual.split(/[,;\n]/).map(cleanPhone).filter((n) => n.replace('+', '').length >= 3);
    if (!nums.length) return;
    setExtra((e) => [...new Set([...e, ...nums])]);
    setManual('');
  };

  const smsNumbers = () => [...new Set([
    ...withPhone.filter((p) => smsIds.has(p.key)).map((p) => cleanPhone(p.phone)),
    ...extra,
    ...(manual.trim() ? manual.split(/[,;\n]/).map(cleanPhone).filter(Boolean) : []),
  ])];

  const save = async (e) => {
    e.preventDefault();
    const numbers = sendSms ? smsNumbers() : [];
    if (sendSms && !numbers.length) { setError('Pick or enter at least one phone number for the text message.'); return; }
    setBusy(true); setError('');
    try {
      const payload = { title, body, audience, targetIds: [...ids] };
      if (isNew) await api('/announcements', { method: 'POST', body: payload });
      else await api(`/announcements/${target.id}`, { method: 'PUT', body: payload });
      if (numbers.length) setSmsLink({ url: smsUrl(numbers, `📢 ${title.trim()}${body.trim() ? `\n\n${body.trim()}` : ''}`), count: numbers.length });
      else onSaved();
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  };

  if (smsLink) {
    return (
      <Sheet open onClose={onSaved} title="Send the text message"
        footer={
          <div className="space-y-2">
            <a href={smsLink.url} className="btn-primary w-full"><Icon name="sms" className="size-5" />Open Messages</a>
            <button type="button" className="btn-ghost w-full" onClick={onSaved}>Done</button>
          </div>
        }>
        <div className="space-y-3 pb-2">
          <p className="rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-800">Announcement posted and app notifications sent.</p>
          <p className="text-sm text-muted">
            Tap <b>Open Messages</b>. It opens with {smsLink.count} recipient{smsLink.count === 1 ? '' : 's'} and the text filled in. Check it, then tap send.
            The text goes from your own phone number.
          </p>
        </div>
      </Sheet>
    );
  }

  return (
    <Sheet open onClose={onClose} title={isNew ? 'New announcement' : 'Edit announcement'}
      footer={<button form="ann-form" className="btn-primary w-full" disabled={busy}>{busy ? 'Sending…' : `${isNew ? 'Post' : 'Update'} & notify${sendSms ? ' + SMS' : ''}`}</button>}>
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
                </label>
              </li>
            ))}
          </ul>
        )}

        <div className="card p-3">
          <label className="flex items-center gap-3">
            <input type="checkbox" className="size-5 accent-brand-600" checked={sendSms} onChange={(e) => setSendSms(e.target.checked)} />
            <Icon name="sms" className="size-5 text-sky-700" />
            <span className="flex-1 font-semibold">Also send as text message (SMS)</span>
          </label>
          {sendSms && (
            <div className="mt-3 space-y-3">
              {withPhone.length > 0 ? (
                <>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted">{withPhone.filter((p) => smsIds.has(p.key)).length} of {withPhone.length} numbers selected</span>
                    <button type="button" className="font-semibold text-brand-600"
                      onClick={() => setSmsIds(smsIds.size === withPhone.length ? new Set() : new Set(withPhone.map((p) => p.key)))}>
                      {smsIds.size === withPhone.length ? 'Clear all' : 'Select all'}
                    </button>
                  </div>
                  <ul className="divide-y divide-line rounded-xl bg-white ring-1 ring-line">
                    {withPhone.map((p) => (
                      <li key={p.key}>
                        <label className="flex items-center gap-3 p-3">
                          <input type="checkbox" className="size-5 accent-brand-600" checked={smsIds.has(p.key)} onChange={() => toggleSms(p.key)} />
                          <Avatar member={p.member} size="size-9" className="text-sm" />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate font-medium">{p.member.name}</span>
                            <span className="block truncate text-sm text-muted">{p.phone}{!p.primary && ' · Phone 2'}</span>
                          </span>
                        </label>
                      </li>
                    ))}
                  </ul>
                </>
              ) : <p className="text-sm text-muted">No family members have a phone number yet.</p>}

              <div>
                <label className="label">Add phone numbers</label>
                <div className="flex gap-2">
                  <input className="input" type="tel" inputMode="tel" value={manual} placeholder="214-555-1234"
                    onChange={(e) => setManual(formatPhone(e.target.value))}
                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addManual(); } }} />
                  <button type="button" className="btn-ghost shrink-0" onClick={addManual} disabled={!manual.trim()}>Add</button>
                </div>
                {extra.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {extra.map((n) => (
                      <span key={n} className="flex items-center gap-1 rounded-full bg-sky-50 py-1 pr-1 pl-3 text-sm font-medium text-sky-800">
                        {formatPhone(n)}
                        <button type="button" className="rounded-full p-1 hover:bg-sky-100" aria-label={`Remove ${n}`}
                          onClick={() => setExtra((e) => e.filter((x) => x !== n))}><Icon name="x" className="size-3.5" /></button>
                      </span>
                    ))}
                  </div>
                )}
              </div>
              <p className="text-xs text-muted">After posting, your Messages app opens with these numbers and the announcement text filled in.</p>
            </div>
          )}
        </div>
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
