import { createContext, createElement, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { clearAuthTokens, fetchCsrfFromCookie, getCsrfToken, refreshSessionFromCookie, request, setAuthTokens } from './api';

export type AuthUser = {
  id: string | number;
  name: string;
  email: string;
  role: string;
};

type LoginInput = { email: string; password: string; captchaToken?: string };
type LoginResponse = { accessToken: string; csrfToken: string; expiresIn: number; user: AuthUser };
export type PasswordChangeInput = { currentPassword: string; password: string; confirmPassword: string };
type AuthContextValue = {
  user: AuthUser | null;
  loading: boolean;
  login: (input: LoginInput) => Promise<AuthUser>;
  logout: () => Promise<void>;
  changePassword: (input: PasswordChangeInput) => Promise<void>;
  updateName: (name: string) => Promise<AuthUser>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const generation = useRef(0);

  useEffect(() => {
    const handleExpired = () => {
      generation.current += 1;
      setUser(null);
      setLoading(false);
    };
    window.addEventListener('bep:auth-expired', handleExpired);

    const startingGeneration = generation.current;
    void (async () => {
      try {
        // After a page reload, obtain CSRF first, then rotate the refresh cookie.
        await fetchCsrfFromCookie();
        await refreshSessionFromCookie();
        const restoredUser = await request<AuthUser>('auth/me');
        if (generation.current === startingGeneration) setUser(restoredUser);
      } catch {
        if (generation.current === startingGeneration) {
          clearAuthTokens();
          setUser(null);
        }
      } finally {
        if (generation.current === startingGeneration) setLoading(false);
      }
    })();

    return () => window.removeEventListener('bep:auth-expired', handleExpired);
  }, []);

  const login = useCallback(async (input: LoginInput) => {
    const result = await request<LoginResponse>('auth/login', {
      method: 'POST',
      body: JSON.stringify(input),
    });
    generation.current += 1;
    setAuthTokens(result);
    setUser(result.user);
    setLoading(false);
    return result.user;
  }, []);

  const logout = useCallback(async () => {
    let csrf = getCsrfToken();
    if (!csrf) {
      try {
        csrf = await fetchCsrfFromCookie();
      } catch {
        // Still call logout; an expired or missing cookie is idempotent server-side.
      }
    }
    try {
      await request<unknown>('auth/logout', {
        method: 'POST',
        headers: { 'X-CSRF-Token': csrf || '' },
      });
    } finally {
      generation.current += 1;
      clearAuthTokens();
      setUser(null);
      setLoading(false);
    }
  }, []);

  const changePassword = useCallback(async (input: PasswordChangeInput) => {
    const csrf = getCsrfToken();
    if (!csrf) throw new Error('Phiên đăng nhập chưa sẵn sàng. Vui lòng tải lại trang.');
    const result = await request<LoginResponse>('auth/change-password', {
      method: 'POST',
      headers: { 'X-CSRF-Token': csrf },
      body: JSON.stringify(input),
    });
    generation.current += 1;
    setAuthTokens(result);
    setUser(result.user);
    setLoading(false);
  }, []);
  const updateName = useCallback(async (name: string) => {
    const csrf = getCsrfToken();
    if (!csrf) throw new Error('Phiên đăng nhập chưa sẵn sàng. Vui lòng tải lại trang.');
    const updated = await request<AuthUser>('auth/me', {
      method: 'PATCH', headers: { 'X-CSRF-Token': csrf }, body: JSON.stringify({ name }),
    });
    generation.current += 1;
    setUser(updated);
    return updated;
  }, []);
  const value = useMemo(() => ({ user, loading, login, logout, changePassword, updateName }), [user, loading, login, logout, changePassword, updateName]);
  return createElement(AuthContext.Provider, { value }, children);
}

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth phải được dùng bên trong AuthProvider.');
  return value;
}
