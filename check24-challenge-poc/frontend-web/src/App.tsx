import React from 'react';
import { fetchHome, getApiBaseUrl } from './api';
import type { HomeResponse } from './types';
import { WidgetRenderer } from './components/WidgetRenderer';

const USERS = [
  { id: '1', label: 'User 1' },
  { id: '2', label: 'User 2' },
];

export function App() {
  const [userId, setUserId] = React.useState<string>(USERS[0].id);
  const [data, setData] = React.useState<HomeResponse | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let cancelled = false;

    setError(null);
    setData(null);

    fetchHome(userId)
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
  }, [userId]);

  return (
    <div style={{ fontFamily: 'system-ui, sans-serif', padding: 16, maxWidth: 900, margin: '0 auto' }}>
      <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
        <div>
          <div style={{ fontSize: 20, fontWeight: 700 }}>CHECK24 Home Widgets PoC</div>
          <div style={{ opacity: 0.8, marginTop: 4 }}>{data?.greeting ?? 'Loading…'}</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <label htmlFor="user" style={{ opacity: 0.8 }}>
            User
          </label>
          <select id="user" value={userId} onChange={(e) => setUserId(e.target.value)}>
            {USERS.map((u) => (
              <option key={u.id} value={u.id}>
                {u.label}
              </option>
            ))}
          </select>
        </div>
      </header>

      <main style={{ marginTop: 16 }}>
        <div style={{ opacity: 0.7, fontSize: 12, marginBottom: 12 }}>
          API: {getApiBaseUrl()}
        </div>

        {error ? <div style={{ color: 'crimson' }}>{error}</div> : null}
        {!error && !data ? <div>Loading…</div> : null}
        {data ? <WidgetRenderer widgets={data.widgets} /> : null}
      </main>
    </div>
  );
}
