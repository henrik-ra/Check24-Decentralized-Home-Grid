/**
 * SSO Authentication Hook
 * Handles token management and handoff exchange
 * 
 * Wichtig: Der Code ist NICHT in localStorage! Nur in der URL als Query-Parameter.
 * 
 * https://dsl-web.azurewebsites.net/offer/201?handoff=7f3a8b2c9d1e4f5a6b7c8d9e

 */

import { useEffect, useState } from 'react';

const TOKEN_STORAGE_KEY = 'c24_token';
const USER_STORAGE_KEY = 'c24_user';

export type User = { email: string };

function loadToken(): string {
	return localStorage.getItem(TOKEN_STORAGE_KEY) ?? '';
}

function loadUser(): User | null {
	const stored = localStorage.getItem(USER_STORAGE_KEY);
	return stored ? (JSON.parse(stored) as User) : null;
}

function saveAuth(token: string, user: User) {
	localStorage.setItem(TOKEN_STORAGE_KEY, token);
	localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(user));
}

async function exchangeHandoff(coreUrl: string, code: string): Promise<{ token: string; user: User }> {
	const response = await fetch(`${coreUrl}/api/auth/exchange`, {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({ code }),
	});

	const bodyText = await response.text().catch(() => '');
	if (!response.ok) {
		throw new Error(
			bodyText ? `SSO exchange failed: ${response.status} - ${bodyText}` : `SSO exchange failed: ${response.status}`
		);
	}

	const data = bodyText ? (JSON.parse(bodyText) as any) : ({} as any);
	const token = typeof data.token === 'string' ? data.token : '';
	const user = typeof data.user === 'object' && data.user !== null ? (data.user as User) : null;
	if (!token || !user?.email) throw new Error('SSO exchange failed: missing token/user');
	return { token, user };
}

export function useSSO(coreUrl: string) {
	const [token, setToken] = useState<string>(() => loadToken()); // load initial token from local storage
	const [user, setUser] = useState<User | null>(() => loadUser()); // load initial user from local storage
	const [ssoError, setSsoError] = useState<string | null>(null);
	// true solange ein ?handoff=-Code in der URL auf seinen Exchange wartet —
	// Aufrufer (z.B. das Auto-Interest-Signal) müssen warten, sonst laufen sie
	// mit der falschen Identität (Fallback-E-Mail statt eingeloggtem User).
	const [ssoPending, setSsoPending] = useState<boolean>(() =>
		new URLSearchParams(window.location.search).has('handoff')
	);

	useEffect(() => {
		// Extrahiere Handoff-Code aus URL
		const params = new URLSearchParams(window.location.search);
		const handoff = params.get('handoff');
		if (!handoff) return; // Kein Code → Normaler Login

		// Exchange Code für JWT-Token
		let cancelled = false;
		(async () => {
			try {
				const result = await exchangeHandoff(coreUrl, handoff);
				// → POST /api/auth/exchange { code: "7f3a8b2c9d..." }

			
				if (cancelled) return;
				// speicher neuen JwT Token in localStorage
				saveAuth(result.token, result.user);
				setToken(result.token);
				setUser(result.user);
				
				// Entferne Handoff-Code aus URL (Security)
				params.delete('handoff');
				const nextSearch = params.toString();
				const nextUrl = `${window.location.pathname}${nextSearch ? `?${nextSearch}` : ''}${window.location.hash || ''}`;
				window.history.replaceState({}, '', nextUrl);
				// → URL wird zu: /offer/201 (ohne ?handoff=...)

			} catch (e: any) {
				if (!cancelled) setSsoError(e?.message ?? 'SSO exchange failed');
			} finally {
				if (!cancelled) setSsoPending(false);
			}
		})();

		return () => {
			cancelled = true;
		};
	}, [coreUrl]);

	return { token, user, ssoError, ssoPending };
}
