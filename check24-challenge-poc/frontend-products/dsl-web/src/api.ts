/**
 * API Client for DSL Speedboat
 * Handles communication with speedboat backend
 */

function normalizeBaseUrl(value: string | undefined): string {
	const v = (value ?? '').trim();
	return v.endsWith('/') ? v.slice(0, -1) : v;
}

export function getSpeedboatUrl(): string {
	return normalizeBaseUrl(import.meta.env.VITE_SPEEDBOAT_URL) || 'http://localhost:3002';
}

export function getHomeUrl(): string {
	return normalizeBaseUrl(import.meta.env.VITE_HOME_URL);
}

export function getCoreUrl(): string {
	return normalizeBaseUrl(import.meta.env.VITE_CORE_URL) || 'http://localhost:3000';
}

export type SimulateInterestParams = {
	email: string;
	vertical: string;
	offerId?: string;
	offerTitle?: string;
	offerSubtitle?: string;
};

export type SimulateInterestOptions = {
	keepalive?: boolean;
	silent?: boolean;
};

export async function simulateInterest(
	speedboatUrl: string,
	params: SimulateInterestParams,
	options?: SimulateInterestOptions
): Promise<{ success: boolean; message?: string }> {
	try {
		const response = await fetch(`${speedboatUrl}/api/simulate/interest`, {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify(params),
			keepalive: Boolean(options?.keepalive),
		});

		if (!response.ok) {
			return { success: false, message: `Fehler: ${response.status}` };
		}

		return { success: true, message: 'Interesse gesendet. Öffne Home, um das Widget zu sehen.' };
	} catch (e: any) {
		return { success: false, message: e?.message ?? 'Netzwerkfehler' };
	}
}
