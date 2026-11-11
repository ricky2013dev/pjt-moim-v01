import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { api, setUnauthorizedHandler } from './api.js';
import { refreshPush, savedToken } from './push.js';
import { checkForUpdate } from './update.js';

const AuthCtx = createContext(null);

export function AuthProvider({ children }) {
  const [me, setMe] = useState(undefined); // undefined = loading, null = signed out
  const [notice, setNotice] = useState('');
  // True right after an explicit sign-in, so the app can pick the landing tab.
  const [justLoggedIn, setJustLoggedIn] = useState(false);

  useEffect(() => {
    setUnauthorizedHandler((msg) => {
      setMe((cur) => {
        if (cur) setNotice(msg || 'Please sign in again.');
        return null;
      });
    });
    api('/auth/me').then(setMe).catch(() => setMe(null));
  }, []);

  useEffect(() => {
    if (me) refreshPush();
  }, [me?.id]);

  const login = useCallback(async (memberId, passcode) => {
    const m = await api('/auth/login', { method: 'POST', body: { memberId, passcode } });
    setNotice('');
    setJustLoggedIn(true);
    setMe(m);
    checkForUpdate({ force: true }); // pick up the newest app build on every sign-in
    return m;
  }, []);

  const logout = useCallback(async () => {
    await api('/auth/logout', { method: 'POST', body: { pushToken: savedToken() } }).catch(() => {});
    try { localStorage.removeItem('moim.pushToken'); } catch {}
    setMe(null);
  }, []);

  return (
    <AuthCtx.Provider value={{ me, setMe, login, logout, notice, justLoggedIn }}>{children}</AuthCtx.Provider>
  );
}

export const useAuth = () => useContext(AuthCtx);
