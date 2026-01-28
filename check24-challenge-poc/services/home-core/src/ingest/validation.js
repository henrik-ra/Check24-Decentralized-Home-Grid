/**
 * Ingest validation: rate limiting, idempotency, payload size
 */

const config = require('../config');
const { buildRateLimitKey, buildIdempotencyKey } = require('../utils/keys');
const { assertFinitePositiveInt } = require('../utils/validation');

/**
 * Parses the Content-Length header to validate payload size.
 */
function getContentLengthBytes(request) {
	const raw = request.headers['content-length'];
	if (raw === undefined) return undefined;
	const parsed = Number.parseInt(String(raw), 10);
	return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined;
}

/**
 * Calculates the start timestamp for the current rate limit window.
 */
function getWindowStartEpochSeconds(nowEpochSeconds, windowSeconds) {
	return Math.floor(nowEpochSeconds / windowSeconds) * windowSeconds;
}

/**
 * Enforces rate limits per product using Redis. Throws 429 if limit exceeded.
 */
async function enforceRateLimitOrThrow(redis, productId) {
	const limit = assertFinitePositiveInt(config.ingest.rateLimitPerMinute, 120);
	const nowEpochSeconds = Math.floor(Date.now() / 1000);
	const windowStart = getWindowStartEpochSeconds(nowEpochSeconds, config.ingest.rateLimitWindowSeconds);
	const key = buildRateLimitKey(productId, windowStart);

	const count = await redis.incr(key);
	if (count === 1) {
		await redis.expire(key, config.ingest.rateLimitWindowSeconds);
	}

	if (count > limit) {
		const retryAfterSeconds = windowStart + config.ingest.rateLimitWindowSeconds - nowEpochSeconds;
		const error = new Error('Rate limit exceeded');
		error.statusCode = 429;
		error.retryAfterSeconds = Math.max(0, retryAfterSeconds);
		throw error;
	}
}

/**
 * Checks if a request with the given idempotency key was already processed.
 * Returns true if it is a duplicate.
 */
async function checkIdempotency(redis, productId, idempotencyKey) {
	if (!idempotencyKey) return false;

	const key = buildIdempotencyKey(productId, idempotencyKey);
	const setResult = await redis.set(key, '1', {
		NX: true,
		EX: assertFinitePositiveInt(config.ingest.idempotencyTtlSeconds, 300),
	});

	return setResult === null; // true if duplicate
}

module.exports = {
	getContentLengthBytes,
	enforceRateLimitOrThrow,
	checkIdempotency,
};
