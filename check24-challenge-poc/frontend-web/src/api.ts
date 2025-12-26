import type { HomeResponse } from './types';

const DEFAULT_API_BASE_URL = 'http://localhost:3000';

export function getApiBaseUrl(): string {
  return import.meta.env.VITE_API_BASE_URL ?? DEFAULT_API_BASE_URL;
}

export async function fetchHome(userId: string): Promise<HomeResponse> {
  const response = await fetch(`${getApiBaseUrl()}/api/home`, {
    cache: 'no-store',
    headers: {
      'x-user-id': userId,
    },
  });

  if (!response.ok) {
    throw new Error(`Home API failed: ${response.status}`);
  }

  return response.json() as Promise<HomeResponse>;
}
