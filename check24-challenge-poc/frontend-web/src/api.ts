import type { HomeResponse } from './types';

// Fallback URL when VITE_API_BASE_URL env variable is not set
const DEFAULT_API_BASE_URL = 'http://localhost:3000';

/**
 * Retrieves API base URL from environment variables with fallback.
 * Uses Vite's import.meta.env for build-time variable injection.
 */
export function getApiBaseUrl(): string {
  return import.meta.env.VITE_API_BASE_URL ?? DEFAULT_API_BASE_URL;
}

/**
 * Response type for login/register endpoints.
 * Contains JWT token and minimal user data.
 */
export type AuthResponse = {
  token: string;
  user: {
    id: string;
    email: string;
  };
};

/**
 * Generic POST request helper with error handling.
 * Automatically stringifies body and parses JSON response.
 * @param path - API endpoint path (e.g., '/api/auth/login')
 * @param body - Request payload (auto-serialized to JSON)
 * @returns Typed response object
 */
async function postJson<T>(path: string, body: unknown): Promise<T> {
  const response = await fetch(`${getApiBaseUrl()}${path}`, {
    method: 'POST', 
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    // Try to extract error details from response body
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
  
/**
 * Registers new user account.
 * @returns JWT token and user object on success
 */
export async function register(email: string, password: string): Promise<AuthResponse> {
  return postJson<AuthResponse>('/api/auth/register', { email, password });
}

/**
 * Authenticates existing user.
 * @returns JWT token and user object on success
 */
export async function login(email: string, password: string): Promise<AuthResponse> {
  return postJson<AuthResponse>('/api/auth/login', { email, password });
}

/**
 * Fetches personalized widget feed from Home Core.
 * Requires JWT authentication via Bearer token.
 * @param token - JWT token from login/register
 * @param forceRefresh - If true, triggers AI welcome text regeneration
 * @returns Widget feed with greeting and optional AI-generated message
 */
export async function fetchHome(token: string, forceRefresh = false): Promise<HomeResponse> {
  const url = new URL(`${getApiBaseUrl()}/api/home`);
  if (forceRefresh) {
    url.searchParams.set('forceRefresh', 'true');
  }

  const response = await fetch(url.toString(), {
    cache: 'no-store', // Disable caching for fresh widget data
    headers: {
      authorization: `Bearer ${token}`, // JWT authentication (RFC 6750)
    },
  });

  if (!response.ok) {
    throw new Error(`Home API failed: ${response.status}`);
  }

  return response.json() as Promise<HomeResponse>;
}
