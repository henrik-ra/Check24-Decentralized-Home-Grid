/**
 * Time and timeout utilities
 */

function nowIso() {
	return new Date().toISOString();
}

function addSecondsToIso(isoString, seconds) {
	return new Date(new Date(isoString).getTime() + seconds * 1000).toISOString();
}

function withTimeout(promise, timeoutMs, label) {
	if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
		return promise;
	}

	return Promise.race([
		promise,
		new Promise((_, reject) => {
			const id = setTimeout(() => {
				clearTimeout(id);
				const error = new Error(`${label || 'operation'} timed out after ${timeoutMs}ms`);
				error.code = 'ETIMEDOUT';
				reject(error);
			}, timeoutMs);
		}),
	]);
}

module.exports = {
	nowIso,
	addSecondsToIso,
	withTimeout,
};
