import type { HomeResponse } from './types';

const DEFAULT_API_BASE_URL = 'http://localhost:3000';

export function getApiBaseUrl(): string {
  return import.meta.env.VITE_API_BASE_URL ?? DEFAULT_API_BASE_URL;
}

export type AuthResponse = {
  token: string;
  user: {
    id: string;
    email: string;
  };
};

async function postJson<T>(path: string, body: unknown): Promise<T> {
  const response = await fetch(`${getApiBaseUrl()}${path}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    let details = '';
    try {
      const text = await response.text();
      details = text ? ` - ${text}` : '';
    } catch {
      // ignore
    }
    throw new Error(`API failed: ${response.status}${details}`);
  }

  return response.json() as Promise<T>;
}

export async function register(email: string, password: string): Promise<AuthResponse> {
  return postJson<AuthResponse>('/api/auth/register', { email, password });
}

export async function login(email: string, password: string): Promise<AuthResponse> {
  return postJson<AuthResponse>('/api/auth/login', { email, password });
}

export async function fetchHome(token: string, forceRefresh = false): Promise<HomeResponse> {
  const url = new URL(`${getApiBaseUrl()}/api/home`);
  if (forceRefresh) {
    url.searchParams.set('forceRefresh', 'true');
  }

  const response = await fetch(url.toString(), {
    cache: 'no-store',
    headers: {
      authorization: `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    throw new Error(`Home API failed: ${response.status}`);
  }

  return response.json() as Promise<HomeResponse>;
}
