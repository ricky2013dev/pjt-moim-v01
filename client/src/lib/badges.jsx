import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { api } from './api.js';

const Ctx = createContext({ badges: { messages: 0, announcements: 0, events: 0 }, refresh: () => {} });

export function BadgeProvider({ children }) {
  const [badges, setBadges] = useState({ messages: 0, announcements: 0, events: 0 });
  const refresh = useCallback(() => api('/badges').then(setBadges).catch(() => {}), []);

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 15000);
    const onVisible = () => document.visibilityState === 'visible' && refresh();
    const onSw = (e) => e.data?.type === 'moim-push' && refresh();
    document.addEventListener('visibilitychange', onVisible);
    navigator.serviceWorker?.addEventListener('message', onSw);
    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', onVisible);
      navigator.serviceWorker?.removeEventListener('message', onSw);
    };
  }, [refresh]);

  useEffect(() => {
    const total = badges.messages + badges.announcements + (badges.events || 0);
    if ('setAppBadge' in navigator) (total ? navigator.setAppBadge(total) : navigator.clearAppBadge()).catch?.(() => {});
  }, [badges]);

  return <Ctx.Provider value={{ badges, refresh }}>{children}</Ctx.Provider>;
}

export const useBadges = () => useContext(Ctx);
