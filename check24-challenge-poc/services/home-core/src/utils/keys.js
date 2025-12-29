/**
 * Redis key builders for consistent naming
 */

function buildWidgetKey(userId, productId, widgetId) {
	return `widget:${userId}:${productId}:${widgetId}`;
}

function buildUserIndexKey(userId) {
	return `user:${userId}:widgets`;
}

function buildAffinityKey(userId) {
	return `affinity:${userId}`;
}

function buildLastInterestKey(userId) {
	return `lastInterest:${userId}`;
}

function buildUserProductLatestWidgetKey(userId, productId) {
	return `user:${userId}:product:${productId}:latestWidgetKey`;
}

function buildIdempotencyKey(productId, idempotencyKey) {
	return `idempo:${productId}:${idempotencyKey}`;
}

function buildRateLimitKey(productId, windowStartEpochSeconds) {
	return `rl:${productId}:${windowStartEpochSeconds}`;
}

function buildHandoffKey(code) {
	return `auth:handoff:${code}`;
}

function buildWelcomeTextKey(userId) {
	return `welcome:${userId}`;
}

module.exports = {
	buildWidgetKey,
	buildUserIndexKey,
	buildAffinityKey,
	buildLastInterestKey,
	buildUserProductLatestWidgetKey,
	buildIdempotencyKey,
	buildRateLimitKey,
	buildHandoffKey,
	buildWelcomeTextKey,
};
