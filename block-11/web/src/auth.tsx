import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { api, RequestError, errorMessage } from './api';
import type { User } from './types';

type AuthState = {
  user: User | null; loading: boolean; error: string;
  setUser: (user: User | null) => void; refresh: () => Promise<void>;
};
const AuthContext = createContext<AuthState | null>(null);
export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, updateUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const revision = useRef(0);
  function setUser(next: User | null) {
    // A late /me response must not undo a newer login/logout action.
    revision.current++; updateUser(next); setError(''); setLoading(false);
  }
  async function refresh() {
    const current = ++revision.current;
    setLoading(true); setError('');
    try { const next = await api.me(); if (current === revision.current) updateUser(next); }
    catch (e) {
      if (current !== revision.current) return;
      updateUser(null); if (!(e instanceof RequestError && e.status === 401)) setError(errorMessage(e));
    }
    finally { if (current === revision.current) setLoading(false); }
  }
  useEffect(() => { void refresh(); }, []);
  return <AuthContext.Provider value={{ user, setUser, loading, error, refresh }}>{children}</AuthContext.Provider>;
}
export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error('AuthProvider required');
  return value;
}
export function safeReturnTo(value: string | null) {
  return value && (['/photos/upload', '/profile', '/following'].includes(value) || /^\/users\/[0-9a-f-]{36}$/.test(value) || /^\/photos\/(?:[a-z0-9-]+\/)?[0-9a-f-]{36}$/.test(value)) ? value : '/photos';
}
