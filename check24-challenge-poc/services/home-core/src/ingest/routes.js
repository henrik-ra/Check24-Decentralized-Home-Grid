/**
 * Ingest routes: /api/ingest, /api/signals
 */

const config = require('../config');
const { getIngestKeyForProduct } = require('./keys');
const { getContentLengthBytes, enforceRateLimitOrThrow, checkIdempotency } = require('./validation');
const { buildWidgetKey, buildUserIndexKey, buildUserProductLatestWidgetKey, buildAffinityKey, buildLastInterestKey } = require('../utils/keys');
const { nowIso, addSecondsToIso } = require('../utils/time');
const { assertFinitePositiveInt } = require('../utils/validation');

function getHeader(request, name) {
	return request.headers[name];
}

const signalBodySchema = {
	type: 'object',
	required: ['userId', 'signal', 'weight'],
	additionalProperties: false,
	properties: {
		userId: { type: 'string', minLength: 1, maxLength: 128 },
		signal: { type: 'string', enum: ['interest'] },
		weight: { type: 'number', minimum: 0.1, maximum: 100 },
		offerId: { type: 'string', minLength: 1, maxLength: 128 },
		offerTitle: { type: 'string', minLength: 1, maxLength: 200 },
		offerSubtitle: { type: 'string', minLength: 1, maxLength: 200 },
	},
};

const ingestBodySchema = {
	type: 'object',
	required: ['userId', 'widgetData'],
	additionalProperties: false,
	properties: {
		userId: { type: 'string', minLength: 1, maxLength: 128 },
		widgetData: {
			type: 'object',
			required: ['widgetId', 'type'],
			additionalProperties: true,
			properties: {
				widgetId: { type: 'string', minLength: 1, maxLength: 128 },
				type: { type: 'string', minLength: 1, maxLength: 64 },
				priority: { type: 'number' },
				components: { type: 'array' },
				data: { type: 'object' },
				schemaVersion: { type: 'string' },
			},
		},
	},
};

function registerIngestRoutes(fastify, { redis }) {
	// Signal endpoint (for product affinity tracking)
	fastify.post(
		'/api/signals',
		{
			schema: { body: signalBodySchema },
		},
		async (request, reply) => {
			const productId = String(getHeader(request, 'x-product-id') || '').trim();
			const apiKey = String(getHeader(request, 'x-api-key') || '').trim();
			const expectedKey = productId ? String(getIngestKeyForProduct(productId) || '').trim() : '';

			if (!productId || !apiKey || !expectedKey || expectedKey !== apiKey) {
				return reply.status(403).send({ error: 'Forbidden' });
			}

			const { userId, weight } = request.body;
			const { offerId, offerTitle, offerSubtitle } = request.body;
			const affinityKey = buildAffinityKey(userId);
			const lastInterestKey = buildLastInterestKey(userId);
			const normalizedProductId = String(productId || '').trim().toLowerCase();
			const lastInterestPayload = {
				productId: normalizedProductId || String(productId || '').trim(),
				...(offerId ? { offerId: String(offerId).trim() } : {}),
				...(offerTitle ? { offerTitle: String(offerTitle).trim() } : {}),
				...(offerSubtitle ? { offerSubtitle: String(offerSubtitle).trim() } : {}),
				at: nowIso(),
			};

			try {
				await Promise.all([
					redis.hIncrByFloat(affinityKey, productId, weight),
					redis.expire(affinityKey, 3600),
					redis.set(lastInterestKey, JSON.stringify(lastInterestPayload), { EX: 3600 }),
				]);
				return reply.send({ status: 'signal_processed', productId, weight });
			} catch (error) {
				request.log.error({ error }, 'Failed to process signal');
				return reply.status(500).send({ error: 'Signal Failure' });
			}
		}
	);

	// Widget ingest endpoint
	fastify.post(
		'/api/ingest',
		{
			schema: { body: ingestBodySchema },
		},
		async (request, reply) => {
			const productId = String(getHeader(request, 'x-product-id') || '').trim();
			const apiKey = String(getHeader(request, 'x-api-key') || '').trim();
			const expectedKey = productId ? String(getIngestKeyForProduct(productId) || '').trim() : '';

			if (!productId || !apiKey || !expectedKey || expectedKey !== apiKey) {
				request.log.warn(
					{ productId, hasApiKey: !!apiKey, expectedKeyFound: !!expectedKey, match: expectedKey === apiKey },
					'Ingest Forbidden'
				);
				return reply.status(403).send({ error: 'Forbidden' });
			}

			// Check payload size
			const contentLengthBytes = getContentLengthBytes(request);
			if (contentLengthBytes !== undefined && contentLengthBytes > config.ingest.maxPayloadBytes) {
				return reply.status(413).send({ error: 'Payload too large' });
			}

			// Rate limiting
			try {
				await enforceRateLimitOrThrow(redis, productId);
			} catch (error) {
				if (error && error.statusCode === 429) {
					reply.header('retry-after', String(error.retryAfterSeconds ?? 60));
					return reply.status(429).send({ error: 'Rate limit exceeded' });
				}
				request.log.error({ error }, 'Rate limit check failed');
				return reply.status(500).send({ error: 'Storage Failure' });
			}

			// Idempotency check
			const idempotencyKey = String(getHeader(request, 'idempotency-key') || '').trim();
			if (idempotencyKey) {
				const isDuplicate = await checkIdempotency(redis, productId, idempotencyKey);
				if (isDuplicate) {
					return reply.send({ status: 'duplicate' });
				}
			}

			const { userId, widgetData } = request.body;
			const widgetId = String(widgetData.widgetId);

			const generatedAt = nowIso();
			const softExpiresAt = addSecondsToIso(generatedAt, assertFinitePositiveInt(config.ingest.widgetSoftTtlSeconds, 60));
			const hardExpiresAt = addSecondsToIso(generatedAt, assertFinitePositiveInt(config.ingest.widgetHardTtlSeconds, 3600));

			const envelope = {
				schemaVersion: widgetData.schemaVersion || '1.0',
				widgetId,
				productId,
				type: widgetData.type,
				priority: widgetData.priority || 0,
				components: widgetData.components || [],
				data: widgetData.data || {},
				softExpiresAt,
				hardExpiresAt,
				generatedAt,
			};

			const widgetKey = buildWidgetKey(userId, productId, widgetId);
			const userIndexKey = buildUserIndexKey(userId);
			const latestWidgetKeyKey = buildUserProductLatestWidgetKey(userId, productId);

			try {
				const previousWidgetKey = await redis.get(latestWidgetKeyKey);
				const shouldRemovePrevious = previousWidgetKey && typeof previousWidgetKey === 'string' && previousWidgetKey !== widgetKey;

				const multi = redis.multi();
				multi.set(widgetKey, JSON.stringify(envelope), {
					EX: assertFinitePositiveInt(config.ingest.widgetHardTtlSeconds, 3600),
				});
				multi.sAdd(userIndexKey, widgetKey);
				multi.expire(userIndexKey, assertFinitePositiveInt(config.ingest.indexTtlSeconds, 604800));
				multi.set(latestWidgetKeyKey, widgetKey, { EX: assertFinitePositiveInt(config.ingest.indexTtlSeconds, 604800) });
				if (shouldRemovePrevious) {
					multi.sRem(userIndexKey, previousWidgetKey);
					multi.del(previousWidgetKey);
				}
				await multi.exec();

				return reply.send({ status: 'acknowledged' });
			} catch (error) {
				request.log.error({ error }, 'Failed to write snapshot');
				return reply.status(500).send({ error: 'Storage Failure' });
			}
		}
	);
}

module.exports = { registerIngestRoutes };
