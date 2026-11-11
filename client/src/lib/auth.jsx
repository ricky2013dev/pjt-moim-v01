import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { api, setUnauthorizedHandler } from './api.js';
import { refreshPush, savedToken } from './push.js';

const AuthCtx = createContext(null);

export function AuthProvider({ children }) {
  const [me, setMe] = useState(undefined); // undefined = loading, null = signed out
  const [notice, setNotice] = useState('');

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
    setMe(m);
    return m;
  }, []);

  const logout = useCallback(async () => {
    await api('/auth/logout', { method: 'POST', body: { pushToken: savedToken() } }).catch(() => {});
    try { localStorage.removeItem('moim.pushToken'); } catch {}
    setMe(null);
  }, []);

  return (
    <AuthCtx.Provider value={{ me, setMe, login, logout, notice }}>{children}</AuthCtx.Provider>
  );
}

export const useAuth = () => useContext(AuthCtx);
