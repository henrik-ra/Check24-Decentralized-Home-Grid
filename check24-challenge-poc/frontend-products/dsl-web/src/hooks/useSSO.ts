/**
 * SSO Authentication Hook
 * Handles token management and handoff exchange
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
	const [token, setToken] = useState<string>(() => loadToken());
	const [user, setUser] = useState<User | null>(() => loadUser());
	const [ssoError, setSsoError] = useState<string | null>(null);

	useEffect(() => {
		const params = new URLSearchParams(window.location.search);
		const handoff = params.get('handoff');
		if (!handoff) return;

		let cancelled = false;
		(async () => {
			try {
				const result = await exchangeHandoff(coreUrl, handoff);
				if (cancelled) return;
				saveAuth(result.token, result.user);
				setToken(result.token);
				setUser(result.user);

				params.delete('handoff');
				const nextSearch = params.toString();
				const nextUrl = `${window.location.pathname}${nextSearch ? `?${nextSearch}` : ''}${window.location.hash || ''}`;
				window.history.replaceState({}, '', nextUrl);
			} catch (e: any) {
				if (!cancelled) setSsoError(e?.message ?? 'SSO exchange failed');
			}
		})();

		return () => {
			cancelled = true;
		};
	}, [coreUrl]);

	return { token, user, ssoError };
}
