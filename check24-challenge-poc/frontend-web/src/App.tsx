import React from 'react';
import { fetchHome, getApiBaseUrl, login, register } from './api';
import type { HomeResponse } from './types';
import { WidgetRenderer } from './components/WidgetRenderer';

const TOKEN_STORAGE_KEY = 'c24_token';

function loadToken(): string {
  return localStorage.getItem(TOKEN_STORAGE_KEY) ?? '';
}

function saveToken(token: string) {
  localStorage.setItem(TOKEN_STORAGE_KEY, token);
}

function clearToken() {
  localStorage.removeItem(TOKEN_STORAGE_KEY);
}

export function App() {
  const [token, setToken] = React.useState<string>(() => loadToken());
  const [email, setEmail] = React.useState<string>('');
  const [password, setPassword] = React.useState<string>('');
  const [mode, setMode] = React.useState<'login' | 'register'>('login');
  const [data, setData] = React.useState<HomeResponse | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let cancelled = false;

    setError(null);
    setData(null);

    if (!token) {
      return () => {
        cancelled = true;
      };
    }

    fetchHome(token)
      .then((response) => {
        if (cancelled) return;
        setData(response);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : 'Unknown error');
      });

    return () => {
      cancelled = true;
    };
  }, [token]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    try {
      const trimmedEmail = email.trim();
      const trimmedPassword = password;
      const res = mode === 'login' ? await login(trimmedEmail, trimmedPassword) : await register(trimmedEmail, trimmedPassword);
      saveToken(res.token);
      setToken(res.token);
      setPassword('');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    }
  }

  function onLogout() {
    clearToken();
    setToken('');
    setData(null);
    setError(null);
  }

  if (!token) {
    return (
      <div style={{ fontFamily: 'system-ui, sans-serif', padding: 16, maxWidth: 520, margin: '0 auto' }}>
        <header style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 20, fontWeight: 700 }}>CHECK24 Home Widgets PoC</div>
          <div style={{ opacity: 0.8, marginTop: 4 }}>Login required</div>
        </header>

        <main>
          <div style={{ opacity: 0.7, fontSize: 12, marginBottom: 12 }}>API: {getApiBaseUrl()}</div>

          <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
            <button type="button" onClick={() => setMode('login')} disabled={mode === 'login'}>
              Login
            </button>
            <button type="button" onClick={() => setMode('register')} disabled={mode === 'register'}>
              Register
            </button>
          </div>

          <form onSubmit={onSubmit} style={{ display: 'grid', gap: 10 }}>
            <label style={{ display: 'grid', gap: 6 }}>
              <span style={{ opacity: 0.8 }}>Email</span>
              <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" required />
            </label>
            <label style={{ display: 'grid', gap: 6 }}>
              <span style={{ opacity: 0.8 }}>Password</span>
              <input value={password} onChange={(e) => setPassword(e.target.value)} type="password" required />
            </label>

            {error ? <div style={{ color: 'crimson' }}>{error}</div> : null}

            <button type="submit">{mode === 'login' ? 'Login' : 'Create account'}</button>
          </form>
        </main>
      </div>
    );
  }

  return (
    <div style={{ fontFamily: 'system-ui, sans-serif', padding: 16, maxWidth: 900, margin: '0 auto' }}>
      <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
        <div>
          <div style={{ fontSize: 20, fontWeight: 700 }}>CHECK24 Home Widgets PoC</div>
          <div style={{ opacity: 0.8, marginTop: 4 }}>{data?.greeting ?? 'Loading…'}</div>
        </div>
        <button type="button" onClick={onLogout}>
          Logout
        </button>
      </header>

      <main style={{ marginTop: 16 }}>
        <div style={{ opacity: 0.7, fontSize: 12, marginBottom: 12 }}>API: {getApiBaseUrl()}</div>

        {error ? <div style={{ color: 'crimson' }}>{error}</div> : null}
        {!error && !data ? <div>Loading…</div> : null}
        {data ? <WidgetRenderer widgets={data.widgets} /> : null}
      </main>
    </div>
  );
}
