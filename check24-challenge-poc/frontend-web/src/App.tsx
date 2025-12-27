import React, { useState, useEffect } from 'react';
import { fetchHome, getApiBaseUrl, login, register, simulateInterest } from './api';
import type { HomeResponse } from './types';
import { WidgetRenderer } from './components/WidgetRenderer';

const TOKEN_STORAGE_KEY = 'c24_token';
const USER_STORAGE_KEY = 'c24_user';

function loadToken(): string {
  return localStorage.getItem(TOKEN_STORAGE_KEY) ?? '';
}

function loadUser(): { email: string } | null {
  const stored = localStorage.getItem(USER_STORAGE_KEY);
  return stored ? JSON.parse(stored) : null;
}

function saveAuth(token: string, user: { email: string }) {
  localStorage.setItem(TOKEN_STORAGE_KEY, token);
  localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(user));
}

function clearAuth() {
  localStorage.removeItem(TOKEN_STORAGE_KEY);
  localStorage.removeItem(USER_STORAGE_KEY);
}

const PageHome = ({ user, onNavigate }: any) => {
  const [data, setData] = useState<HomeResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  
  useEffect(() => {
    const token = loadToken();
    if (!token) return;

    fetchHome(token).then(setData).catch((err) => setError(err.message));
    const interval = setInterval(() => fetchHome(token).then(setData).catch(console.error), 5000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className='page-home'>
      <h2>Welcome back, {user.email}</h2>
      {error && <div style={{ color: 'red' }}>Error: {error}</div>}
      
      {(!data?.widgets || data.widgets.length === 0) ? (
        <div className='empty-state' style={{ padding: '2rem', background: '#f5f5f5', borderRadius: '8px', textAlign: 'center' }}>
          <p>Your home screen is empty.</p>
          <p>Visit our products to find deals tailored for you!</p>
          <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center', marginTop: '1rem', flexWrap: 'wrap' }}>
            <button onClick={() => onNavigate('travel')} style={{ padding: '0.5rem 1rem', background: '#00b4db', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>Travel</button>
            <button onClick={() => onNavigate('dsl')} style={{ padding: '0.5rem 1rem', background: '#663399', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>DSL</button>
            <button onClick={() => onNavigate('insurance')} style={{ padding: '0.5rem 1rem', background: '#2ecc71', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>Insurance</button>
          </div>
        </div>
      ) : (
        <WidgetRenderer widgets={data.widgets} />
      )}
    </div>
  );
};

const GenericProductPage = ({ user, vertical, title, subtitle, color }: any) => {
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);

  const handleSearch = async () => {
    setLoading(true);
    try {
      await simulateInterest(user.email, vertical);
      setSearched(true);
    } catch (e: any) {
      console.error(e);
      alert('Simulation failed: ' + e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={`page-${vertical}`} style={{ padding: '2rem' }}>
      <div style={{ background: `linear-gradient(to right, ${color}, #333)`, padding: '3rem', borderRadius: '12px', color: 'white', textAlign: 'center' }}>
        <h1>CHECK24 {title}</h1>
        <p>{subtitle}</p>
        
        {!searched ? (
          <div className='search-box' style={{ background: 'white', padding: '1rem', borderRadius: '8px', marginTop: '2rem', display: 'flex', gap: '1rem', justifyContent: 'center' }}>
            <input type='text' placeholder='Search...' style={{ padding: '0.5rem', width: '200px' }} />
            <button onClick={handleSearch} disabled={loading} style={{ padding: '0.5rem 1rem', background: color, filter: 'brightness(0.8)', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}>
              {loading ? 'Simulating...' : 'Simulate Interest'}
            </button>
          </div>
        ) : (
          <div className='results' style={{ marginTop: '2rem', background: 'rgba(255,255,255,0.2)', padding: '1rem', borderRadius: '8px' }}>
            <h3>Interest Registered!</h3>
            <p>We have noted your interest in {title}. Check your Home screen for updates.</p>
          </div>
        )}
      </div>
    </div>
  );
};

export function App() {
  const [token, setToken] = useState<string>(() => loadToken());
  const [user, setUser] = useState<{ email: string } | null>(() => loadUser());
  const [page, setPage] = useState<string>('home');
  
  // Login State
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [authError, setAuthError] = useState<string | null>(null);

  async function onAuthSubmit(e: React.FormEvent) {
    e.preventDefault();
    setAuthError(null);
    try {
      const res = mode === 'login' ? await login(email, password) : await register(email, password);
      saveAuth(res.token, res.user);
      setToken(res.token);
      setUser(res.user);
      setPassword('');
    } catch (err: any) {
      setAuthError(err.message);
    }
  }

  function onLogout() {
    clearAuth();
    setToken('');
    setUser(null);
    setPage('home');
  }

  if (!token || !user) {
    return (
      <div style={{ fontFamily: 'system-ui, sans-serif', padding: 16, maxWidth: 520, margin: '0 auto' }}>
        <header style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 20, fontWeight: 700 }}>CHECK24 Home Widgets PoC</div>
          <div style={{ opacity: 0.8, marginTop: 4 }}>Login required</div>
        </header>
        <main>
          <div style={{ opacity: 0.7, fontSize: 12, marginBottom: 12 }}>API: {getApiBaseUrl()}</div>
          <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
            <button type='button' onClick={() => setMode('login')} disabled={mode === 'login'}>Login</button>
            <button type='button' onClick={() => setMode('register')} disabled={mode === 'register'}>Register</button>
          </div>
          <form onSubmit={onAuthSubmit} style={{ display: 'grid', gap: 10 }}>
            <label style={{ display: 'grid', gap: 6 }}>
              <span style={{ opacity: 0.8 }}>Email</span>
              <input type='email' value={email} onChange={(e) => setEmail(e.target.value)} required style={{ padding: 8 }} />
            </label>
            <label style={{ display: 'grid', gap: 6 }}>
              <span style={{ opacity: 0.8 }}>Password</span>
              <input type='password' value={password} onChange={(e) => setPassword(e.target.value)} required style={{ padding: 8 }} />
            </label>
            {authError && <div style={{ color: 'red' }}>{authError}</div>}
            <button type='submit' style={{ padding: 10, fontWeight: 700, cursor: 'pointer' }}>
              {mode === 'login' ? 'Login' : 'Register'}
            </button>
          </form>
        </main>
      </div>
    );
  }

  return (
    <div className='app-shell' style={{ fontFamily: 'system-ui, sans-serif' }}>
      <nav style={{ background: '#005ea8', padding: '1rem', color: 'white', display: 'flex', gap: '1rem', alignItems: 'center', overflowX: 'auto' }}>
        <div style={{ fontWeight: 'bold', fontSize: '1.2rem', marginRight: '1rem' }}>CHECK24 PoC</div>
        <button onClick={() => setPage('home')} style={{ background: 'transparent', border: 'none', color: page === 'home' ? 'white' : '#ccc', cursor: 'pointer', fontWeight: 'bold' }}>Home</button>
        <button onClick={() => setPage('travel')} style={{ background: 'transparent', border: 'none', color: page === 'travel' ? 'white' : '#ccc', cursor: 'pointer' }}>Reisen</button>
        <button onClick={() => setPage('dsl')} style={{ background: 'transparent', border: 'none', color: page === 'dsl' ? 'white' : '#ccc', cursor: 'pointer' }}>DSL</button>
        <button onClick={() => setPage('insurance')} style={{ background: 'transparent', border: 'none', color: page === 'insurance' ? 'white' : '#ccc', cursor: 'pointer' }}>Versicherung</button>
        <button onClick={() => setPage('energy')} style={{ background: 'transparent', border: 'none', color: page === 'energy' ? 'white' : '#ccc', cursor: 'pointer' }}>Energie</button>
        <button onClick={() => setPage('finance')} style={{ background: 'transparent', border: 'none', color: page === 'finance' ? 'white' : '#ccc', cursor: 'pointer' }}>Finanzen</button>
        <button onClick={() => setPage('shopping')} style={{ background: 'transparent', border: 'none', color: page === 'shopping' ? 'white' : '#ccc', cursor: 'pointer' }}>Shopping</button>
        
        <div style={{ marginLeft: 'auto', fontSize: '0.9rem' }}>{user.email}</div>
        <button onClick={onLogout} style={{ background: 'rgba(255,255,255,0.2)', border: 'none', color: 'white', padding: '0.25rem 0.5rem', borderRadius: '4px', cursor: 'pointer' }}>Logout</button>
      </nav>

      <main style={{ maxWidth: '800px', margin: '2rem auto', padding: '0 1rem' }}>
        {page === 'home' && <PageHome user={user} onNavigate={setPage} />}
        {page === 'travel' && <GenericProductPage user={user} vertical="travel" title="Reisen" subtitle="Find your dream vacation" color="#00b4db" />}
        {page === 'dsl' && <GenericProductPage user={user} vertical="dsl" title="DSL" subtitle="Highspeed Internet" color="#663399" />}
        {page === 'insurance' && <GenericProductPage user={user} vertical="insurance" title="Versicherung" subtitle="Best protection" color="#2ecc71" />}
        {page === 'energy' && <GenericProductPage user={user} vertical="energy" title="Energie" subtitle="Save on power" color="#f1c40f" />}
        {page === 'finance' && <GenericProductPage user={user} vertical="finance" title="Finanzen" subtitle="Best credits" color="#e74c3c" />}
        {page === 'shopping' && <GenericProductPage user={user} vertical="shopping" title="Shopping" subtitle="Best deals" color="#34495e" />}
      </main>
    </div>
  );
}
