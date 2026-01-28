import { getApiBaseUrl } from './api';

const TOKEN_STORAGE_KEY = 'c24_token';
const HANDOFF_PARAM_NAME = 'handoff';
const HTTP_URL_PATTERN = /^https?:\/\//i;

const HANDOFF_ENDPOINT = '/api/auth/handoff';

/*
-------------------------------------------------------------------------
Handoff-Code example:
7f3a8b2c9d1e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9

↑
64 Zeichen lang (32 Bytes Hex)
Enthält KEINE User-Daten (nur Zufall)
60 Sekunden gültig
Kann NICHT dekodiert werden (Random)

-------------------------------------------------------------------------

JWT example:
  eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiI2NzhjZmYxMjM0NTYiLCJlbWFpbCI6ImRlbW9AY2hlY2syNC5kZXYiLCJpYXQiOjE3Mzc4OTEyMDAsImV4cCI6MTczNzk3NzYwMH0.K8ZqJ3vY9mN2xR4tL7wP5eA1cD6fG8hI0jK2lM3nO4p
    ↑
    205 Zeichen lang
    Enthält User-Daten (email, userId)
    7 Tage gültig
    Kann dekodiert werden (Base64)

 */


/**
 * Retrieves the authentication token from localStorage.
 */
function getStoredToken(): string {
  return localStorage.getItem(TOKEN_STORAGE_KEY) ?? '';
}

/**
 * Checks if the given URL is an HTTP/HTTPS URL.
 */
function isHttpUrl(url: string): boolean {
  return HTTP_URL_PATTERN.test(url);
}

/**
 * Appends the SSO handoff code to the target URL as a query parameter.
 * Returns the original URL if parsing fails.
 */
function appendHandoffToUrl(targetUrl: string, handoffCode: string): string {
  try {
    const url = new URL(targetUrl);
    url.searchParams.set(HANDOFF_PARAM_NAME, handoffCode);
    return url.toString();
  } catch (error) {
    return targetUrl;
  }
}

/**
 * Creates a single-use handoff code for SSO by exchanging the current JWT token.
 * @throws {Error} If the API call fails or returns an invalid response.
 */
async function createHandoffCode(token: string): Promise<string> {
  const response = await fetch(`${getApiBaseUrl()}${HANDOFF_ENDPOINT}`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    const errorBody = await response.text().catch(() => '');
    const errorMessage = errorBody 
      ? `SSO handoff failed: ${response.status} - ${errorBody}` 
      : `SSO handoff failed: ${response.status}`;
    throw new Error(errorMessage);
  }

  const responseBody = await response.text().catch(() => '');
  const data = responseBody ? (JSON.parse(responseBody) as { code?: string }) : {};
  
  if (!data.code || typeof data.code !== 'string') {
    throw new Error('SSO handoff failed: missing or invalid code in response');
  }

  return data.code;
}

/**
 * Navigates to the target URL with SSO authentication if available.
 * For HTTP/HTTPS URLs: Attempts to attach a handoff code for seamless authentication.
 * For deep links: Navigates directly without SSO.
 * Falls back to direct navigation if SSO fails.
 */
export async function navigateWithSso(url: string): Promise<void> {
  const targetUrl = String(url || '').trim();
  
  if (!targetUrl) {
    return;
  }

  if (!isHttpUrl(targetUrl)) {
    navigateToUrl(targetUrl);
    return;
  }

  const token = getStoredToken();
  if (!token) {
    navigateToUrl(targetUrl);
    return;
  }

  try {
    const handoffCode = await createHandoffCode(token);
    const urlWithHandoff = appendHandoffToUrl(targetUrl, handoffCode);
    navigateToUrl(urlWithHandoff);
  } catch (error) {
    // Best-effort: Navigate without SSO if handoff creation fails
    navigateToUrl(targetUrl);
  }
}

/**
 * Performs the actual browser navigation.
 */
function navigateToUrl(url: string): void {
  window.location.href = url;
}
