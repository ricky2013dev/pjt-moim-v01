import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useEffect } from 'react';
import Icon from './Icon.jsx';
import { useAuth } from '../lib/auth.jsx';
import { useBadges } from '../lib/badges.jsx';

function Tab({ to, icon, label, badge, badgeClass = 'bg-rose-500', end }) {
  return (
    <NavLink to={to} end={end}
      className={({ isActive }) => `relative flex flex-1 flex-col items-center justify-center gap-0.5 rounded-xl py-2 text-[10.5px] font-semibold tracking-wide transition-all duration-200 ${isActive ? 'bg-gradient-to-br from-brand-500 to-sky-500 text-white shadow-md shadow-brand-500/30' : 'text-slate-500 hover:bg-brand-50 hover:text-brand-600'}`}>
      <span className="relative">
        <Icon name={icon} className="size-[21px]" />
        {badge > 0 && (
          <span className={`absolute -top-1.5 -right-2.5 min-w-[18px] rounded-full ${badgeClass} px-1 text-center text-[10px] font-bold leading-[18px] text-white ring-2 ring-white`}>
            {badge > 99 ? '99+' : badge}
          </span>
        )}
      </span>
      {label}
    </NavLink>
  );
}

export default function Layout() {
  const { me } = useAuth();
  const { badges, refresh } = useBadges();
  const navigate = useNavigate();
  const location = useLocation();

  // Every navigation (including tapping the current tab again) re-checks unread counts.
  useEffect(() => { refresh(); }, [location.key, refresh]);

  // Tapping a notification while the app is open navigates in place.
  useEffect(() => {
    const onMsg = (e) => e.data?.type === 'moim-navigate' && navigate(e.data.url);
    navigator.serviceWorker?.addEventListener('message', onMsg);
    return () => navigator.serviceWorker?.removeEventListener('message', onMsg);
  }, [navigate]);

  return (
    <div className="mx-auto flex min-h-full max-w-2xl flex-col">
      {/* Keyed by location so each visit to a tab remounts the page and refetches its data. */}
      <main key={location.key} className="flex-1 pb-28">
        <Outlet />
      </main>
      <nav className="pointer-events-none fixed inset-x-0 bottom-0 z-40 px-3" style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}>
        <div className="pointer-events-auto mx-auto flex max-w-md gap-1 rounded-2xl bg-white/95 p-1.5 shadow-[0_10px_30px_-8px_rgba(31,94,234,0.35)] ring-1 ring-brand-100 backdrop-blur">
          <Tab to="/" end icon="home" label="News" badge={badges.announcements} />
          <Tab to="/family" icon="users" label="Family" />
          <Tab to="/messages" icon="chat" label="Messages" badge={badges.messages} badgeClass="bg-emerald-500" />
          <Tab to="/me" icon="user" label="Me" />
          {me?.role === 'admin' && <Tab to="/admin" icon="shield" label="Admin" />}
        </div>
      </nav>
    </div>
  );
}

export function PageHeader({ title, subtitle, action, back }) {
  const navigate = useNavigate();
  return (
    <header className="pt-safe sticky top-0 z-30 mb-5 overflow-hidden rounded-b-[28px] bg-gradient-to-br from-brand-600 via-brand-500 to-sky-400 text-white shadow-[0_8px_24px_-8px_rgba(31,94,234,0.5)]">
      {/* soft decorative glow */}
      <div aria-hidden className="pointer-events-none absolute -top-16 -right-10 size-48 rounded-full bg-white/25 blur-3xl" />
      <div aria-hidden className="pointer-events-none absolute -bottom-20 -left-12 size-40 rounded-full bg-sky-300/40 blur-3xl" />
      <div className="relative flex items-center gap-3 px-5 pt-4 pb-5">
        {back && (
          <button onClick={() => (window.history.length > 1 ? navigate(-1) : navigate(back))}
            className="-ml-1 grid size-10 shrink-0 place-items-center rounded-full bg-white/10 ring-1 ring-white/15 transition hover:bg-white/20" aria-label="Back">
            <Icon name="back" className="size-5" />
          </button>
        )}
        <div className="min-w-0 flex-1">
          {!back && <p className="mb-0.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-white/75">Moim</p>}
          <h1 className="truncate text-[22px] font-bold leading-tight tracking-tight">{title}</h1>
          {subtitle && <p className="mt-0.5 truncate text-[13px] text-white/85">{subtitle}</p>}
        </div>
        {action}
      </div>
    </header>
  );
}

export function Empty({ icon, title, children }) {
  return (
    <div className="flex flex-col items-center px-8 py-16 text-center">
      <div className="mb-4 grid size-16 place-items-center rounded-full bg-brand-50 text-brand-600">
        <Icon name={icon} className="size-8" />
      </div>
      <p className="font-semibold">{title}</p>
      {children && <p className="mt-1 text-sm text-muted">{children}</p>}
    </div>
  );
}

export function ErrorText({ children }) {
  if (!children) return null;
  return <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{children}</p>;
}
