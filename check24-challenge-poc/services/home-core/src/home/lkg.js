/**
 * Last Known Good (LKG) cache for home responses
 * In-memory fallback when Redis is unavailable
 */

const config = require('../config');
const { assertFinitePositiveInt } = require('../utils/validation');

const lastKnownGoodHomeByUser = new Map();

function lkgPruneExpired() {
	const now = Date.now();
	for (const [key, entry] of lastKnownGoodHomeByUser.entries()) {
		if (!entry || entry.expiresAtMs <= now) {
			lastKnownGoodHomeByUser.delete(key);
		}
	}
}

function lkgGet(userId) {
	const entry = lastKnownGoodHomeByUser.get(userId);
	if (!entry) return undefined;
	if (entry.expiresAtMs <= Date.now()) {
		lastKnownGoodHomeByUser.delete(userId);
		return undefined;
	}

	// Refresh recency (Map preserves insertion order)
	lastKnownGoodHomeByUser.delete(userId);
	lastKnownGoodHomeByUser.set(userId, entry);
	return entry.value;
}

function lkgSet(userId, value) {
	lkgPruneExpired();
	const maxEntries = assertFinitePositiveInt(config.home.lkgMaxEntries, 5000);
	const ttl = assertFinitePositiveInt(config.home.lkgTtlMs, 5 * 60 * 1000);

	lastKnownGoodHomeByUser.delete(userId);
	lastKnownGoodHomeByUser.set(userId, { value, expiresAtMs: Date.now() + ttl });

	while (lastKnownGoodHomeByUser.size > maxEntries) {
		const oldestKey = lastKnownGoodHomeByUser.keys().next().value;
		lastKnownGoodHomeByUser.delete(oldestKey);
	}
}

module.exports = {
	lkgGet,
	lkgSet,
};
