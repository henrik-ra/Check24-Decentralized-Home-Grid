import { getApiBaseUrl } from './api';

const TOKEN_STORAGE_KEY = 'c24_token';

function loadToken(): string {
  return localStorage.getItem(TOKEN_STORAGE_KEY) ?? '';
}

function isHttpUrl(url: string): boolean {
  return /^https?:\/\//i.test(url);
}

function appendHandoff(url: string, code: string): string {
  try {
    const u = new URL(url);
    u.searchParams.set('handoff', code);
    return u.toString();
  } catch {
    return url;
  }
}

async function createHandoffCode(token: string): Promise<string> {
  const response = await fetch(`${getApiBaseUrl()}/api/auth/handoff`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${token}`,
    },
  });

  const bodyText = await response.text().catch(() => '');
  if (!response.ok) {
    throw new Error(bodyText ? `handoff failed: ${response.status} - ${bodyText}` : `handoff failed: ${response.status}`);
  }

  const data = bodyText ? (JSON.parse(bodyText) as any) : ({} as any);
  const code = typeof data.code === 'string' ? data.code : '';
  if (!code) throw new Error('handoff failed: missing code');
  return code;
}

export async function navigateWithSso(url: string): Promise<void> {
  const target = String(url || '').trim();
  if (!target) return;

  // Only attach handoff to real web URLs; keep deep links unchanged.
  if (!isHttpUrl(target)) {
    window.location.href = target;
    return;
  }

  const token = loadToken();
  if (!token) {
    window.location.href = target;
    return;
  }

  try {
    const code = await createHandoffCode(token);
    window.location.href = appendHandoff(target, code);
  } catch {
    // Best-effort: still navigate.
    window.location.href = target;
  }
}
