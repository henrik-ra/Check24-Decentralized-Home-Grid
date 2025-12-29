/**
 * Home feed route: GET /api/home
 */

const config = require('../config');
const { buildUserIndexKey, buildAffinityKey, buildLastInterestKey } = require('../utils/keys');
const { nowIso, withTimeout } = require('../utils/time');
const { assertFinitePositiveInt } = require('../utils/validation');
const { lkgGet, lkgSet } = require('./lkg');
const { ensureMinWidgets } = require('./widgets');
const { getOrGenerateWelcomeText } = require('./welcome');

function buildEmptyHomeResponse({ degraded, reason }) {
	const widgets = ensureMinWidgets([], assertFinitePositiveInt(config.home.minWidgets, 3));
	return {
		schemaVersion: '1.0',
		generatedAt: nowIso(),
		greeting: 'Willkommen',
		welcomeText: 'Schön, dass du da bist. Entdecke heute neue Angebote.',
		widgets,
		...(degraded ? { meta: { degraded: true, reason: reason || 'unavailable', source: 'empty' } } : {}),
	};
}

function registerHomeRoutes(fastify, { redis }) {
	fastify.get('/api/home', async (request, reply) => {
		const { resolveUserIdOrThrow } = require('../auth/jwt');
		const userId = await resolveUserIdOrThrow(fastify, request, reply);
		if (!userId) return;

		const userIndexKey = buildUserIndexKey(userId);
		const affinityKey = buildAffinityKey(userId);
		const lastInterestKey = buildLastInterestKey(userId);

		try {
			const [widgetKeys, affinities, lastInterestRaw] = await Promise.all([
				withTimeout(redis.sMembers(userIndexKey), config.redis.readTimeoutMs, 'redis.sMembers(userIndexKey)'),
				withTimeout(redis.hGetAll(affinityKey), config.redis.readTimeoutMs, 'redis.hGetAll(affinityKey)'),
				withTimeout(redis.get(lastInterestKey), config.redis.readTimeoutMs, 'redis.get(lastInterestKey)'),
			]);

			const forceRefresh = request.query.forceRefresh === 'true';
			const welcomeText = await getOrGenerateWelcomeText(
				redis,
				request,
				userId,
				affinities,
				lastInterestRaw,
				forceRefresh
			);

			if (!widgetKeys || widgetKeys.length === 0) {
				const response = buildEmptyHomeResponse({ degraded: false });
				response.welcomeText = welcomeText;
				lkgSet(userId, response);
				return reply.send(response);
			}

			const rawWidgets = await withTimeout(redis.mGet(widgetKeys), config.redis.readTimeoutMs, 'redis.mGet(widgetKeys)');

			const expiredKeys = [];
			const widgets = [];

			for (let index = 0; index < widgetKeys.length; index += 1) {
				const key = widgetKeys[index];
				const raw = rawWidgets[index];
				if (raw === null) {
					expiredKeys.push(key);
					continue;
				}

				try {
					const widget = JSON.parse(raw);
					const affinityScore = Number.parseFloat(affinities?.[widget.productId] || '0');
					const boost = affinityScore * 20;
					widget.priority = (widget.priority || 0) + boost;
					if (boost > 0) {
						widget.meta = { ...(widget.meta || {}), isPersonalized: true, reason: 'Based on your recent interest' };
					}
					widgets.push(widget);
				} catch {
					expiredKeys.push(key);
				}
			}

			if (expiredKeys.length > 0) {
				// Best-effort cleanup; do not fail request
				const redisCleanup = redis.sRem(userIndexKey, expiredKeys).catch((error) => {
					request.log.warn({ error }, 'Failed to cleanup expired index entries');
				});
				void redisCleanup;
			}

			widgets.sort((a, b) => (b.priority || 0) - (a.priority || 0));
			const filledWidgets = ensureMinWidgets(widgets, assertFinitePositiveInt(config.home.minWidgets, 3));

			const response = {
				schemaVersion: '1.0',
				generatedAt: nowIso(),
				greeting: 'Willkommen zurück!',
				welcomeText,
				widgets: filledWidgets,
			};
			lkgSet(userId, response);
			return reply.send(response);
		} catch (error) {
			request.log.warn({ error: { message: error?.message, code: error?.code }, userId }, 'Home read degraded (redis unavailable)');

			const cached = lkgGet(userId);
			if (cached) {
				return reply.send({
					...cached,
					generatedAt: nowIso(),
					meta: { degraded: true, reason: 'redis_unavailable', source: 'lkg' },
				});
			}

			return reply.send(buildEmptyHomeResponse({ degraded: true, reason: 'redis_unavailable' }));
		}
	});
}

module.exports = { registerHomeRoutes };
