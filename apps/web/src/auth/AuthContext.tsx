import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, tokenStore } from '../api/client';
import type { User } from '../api/types';

interface AuthState {
  user: User | null;
  token: string | null;
  loading: boolean;
  signIn: (token: string, user: User) => void;
  signOut: () => void;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const [token, setToken] = useState<string | null>(() => tokenStore.get());

  // Token varsa /auth/me ile kullanıcıyı doğrula (sayfa yenilendiğinde oturum devam eder)
  const me = useQuery({
    queryKey: ['me', token],
    queryFn: api.me,
    enabled: !!token,
    retry: false,
    staleTime: Infinity,
  });

  const signIn = useCallback(
    (t: string, user: User) => {
      tokenStore.set(t);
      qc.setQueryData(['me', t], user);
      setToken(t);
    },
    [qc],
  );

  const signOut = useCallback(() => {
    tokenStore.set(null);
    setToken(null);
    qc.clear();
  }, [qc]);

  useEffect(() => {
    const onUnauthorized = () => signOut();
    window.addEventListener('auth:unauthorized', onUnauthorized);
    return () => window.removeEventListener('auth:unauthorized', onUnauthorized);
  }, [signOut]);

  const value = useMemo<AuthState>(
    () => ({
      token,
      user: token ? (me.data ?? null) : null,
      loading: !!token && me.isLoading,
      signIn,
      signOut,
    }),
    [token, me.data, me.isLoading, signIn, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth, AuthProvider içinde kullanılmalı');
  return ctx;
}
