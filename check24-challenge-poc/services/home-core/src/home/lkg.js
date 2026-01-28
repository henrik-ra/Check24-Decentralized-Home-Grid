/**
 * Last Known Good (LKG) cache for home responses
 * In-memory fallback when Redis is unavailable
 */

const config = require('../config');
const { assertFinitePositiveInt } = require('../utils/validation');

// Stores the last known good home response per user (LRU-like via insertion order)
const lastKnownGoodHomeByUser = new Map();

// Removes expired entries from the cache
function lkgPruneExpired() {
	const now = Date.now();
	for (const [key, entry] of lastKnownGoodHomeByUser.entries()) {
		if (!entry || entry.expiresAtMs <= now) {
			lastKnownGoodHomeByUser.delete(key);
		}
	}
}

// Returns the cached entry for a user (and refreshes its recency)
function lkgGet(userId) {
	const entry = lastKnownGoodHomeByUser.get(userId);
	if (!entry) return undefined;
	if (entry.expiresAtMs <= Date.now()) {
		lastKnownGoodHomeByUser.delete(userId);
		return undefined;
	}

	// Refreshes recency by reinserting the entry
	lastKnownGoodHomeByUser.delete(userId);
	lastKnownGoodHomeByUser.set(userId, entry);
	return entry.value;
}

// Writes/updates an entry and enforces cache size/TTL
function lkgSet(userId, value) {
	lkgPruneExpired();
	// Configuration with fallbacks
	const maxEntries = assertFinitePositiveInt(config.home.lkgMaxEntries, 5000);
	const ttl = assertFinitePositiveInt(config.home.lkgTtlMs, 5 * 60 * 1000);

	// Overwrite existing entry
	lastKnownGoodHomeByUser.delete(userId);
	lastKnownGoodHomeByUser.set(userId, { value, expiresAtMs: Date.now() + ttl });

	// Remove oldest entries until the limit is met
	while (lastKnownGoodHomeByUser.size > maxEntries) {
		const oldestKey = lastKnownGoodHomeByUser.keys().next().value;
		lastKnownGoodHomeByUser.delete(oldestKey);
	}
}

module.exports = {
	lkgGet,
	lkgSet,
};
