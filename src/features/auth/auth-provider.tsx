import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';

type AuthStatus = 'checking' | 'authenticated' | 'unauthenticated';

type SiscoreSession = {
  usuario: string;
};

type AuthContextValue = {
  status: AuthStatus;
  session: SiscoreSession | null;
  login: (usuario: string, senha: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshSession: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

async function parseApiResponse(response: Response) {
  const data = await response.json().catch(() => ({}));
  const error =
    typeof data?.error === 'string'
      ? data.error
      : 'Falha inesperada ao processar a autenticacao.';
  const details = Array.isArray(data?.details)
    ? data.details.filter((detail: unknown): detail is string => typeof detail === 'string' && detail.trim().length > 0)
    : [];

  if (!response.ok) {
    throw new Error([error, ...details].join('\n'));
  }

  return data;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>('checking');
  const [session, setSession] = useState<SiscoreSession | null>(null);

  async function refreshSession() {
    try {
      const response = await fetch('/api/auth/session', {
        method: 'GET',
        credentials: 'include',
      });

      if (response.status === 401) {
        setSession(null);
        setStatus('unauthenticated');
        return;
      }

      const data = await parseApiResponse(response);
      setSession(data.session as SiscoreSession);
      setStatus('authenticated');
    } catch {
      setSession(null);
      setStatus('unauthenticated');
    }
  }

  async function login(usuario: string, senha: string) {
    const response = await fetch('/api/auth/login', {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ usuario, senha }),
    });

    const data = await parseApiResponse(response);
    setSession(data.session as SiscoreSession);
    setStatus('authenticated');
  }

  async function logout() {
    await fetch('/api/auth/logout', {
      method: 'POST',
      credentials: 'include',
    });

    setSession(null);
    setStatus('unauthenticated');
  }

  useEffect(() => {
    void refreshSession();
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      status,
      session,
      login,
      logout,
      refreshSession,
    }),
    [session, status]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error('useAuth deve ser usado dentro de AuthProvider.');
  }

  return context;
}
