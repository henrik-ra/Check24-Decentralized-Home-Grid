const cors = require('@fastify/cors');
const fastifyFactory = require('fastify');
const { createClient } = require('redis');

const DEFAULT_INGEST_KEYS_JSON = '{"travel":"dev-secret-123"}';

function parseIngestKeysJson(value) {
	try {
		const parsed = JSON.parse(value);
		if (!parsed || typeof parsed !== 'object') return {};
		return parsed;
	} catch {
		return {};
	}
}

const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
const ingestKeys = parseIngestKeysJson(process.env.INGEST_KEYS_JSON || DEFAULT_INGEST_KEYS_JSON);

// Read-path resilience settings
const redisReadTimeoutMs = Number.parseInt(process.env.REDIS_READ_TIMEOUT_MS || '40', 10);
const lkgTtlMs = Number.parseInt(process.env.LKG_TTL_MS || `${5 * 60 * 1000}` /* 5 min */, 10);
const lkgMaxEntries = Number.parseInt(process.env.LKG_MAX_ENTRIES || '5000', 10);

const widgetSoftTtlSeconds = Number.parseInt(process.env.WIDGET_SOFT_TTL_SECONDS || '60', 10);
const widgetHardTtlSeconds = Number.parseInt(process.env.WIDGET_HARD_TTL_SECONDS || '3600', 10);
const indexTtlSeconds = Number.parseInt(process.env.INDEX_TTL_SECONDS || '604800', 10); // 7 days
const idempotencyTtlSeconds = Number.parseInt(process.env.IDEMPOTENCY_TTL_SECONDS || '300', 10);
const maxPayloadBytes = Number.parseInt(process.env.MAX_INGEST_PAYLOAD_BYTES || '65536', 10); // 64KB

// Rate limiting (per productId)
const ingestRateLimitPerMinute = Number.parseInt(process.env.INGEST_RATE_LIMIT_PER_MINUTE || '120', 10);
const ingestRateLimitWindowSeconds = 60;

const fastify = fastifyFactory({
	logger: true,
	// Enforce max request payload size at the framework level.
	bodyLimit: Number.isFinite(maxPayloadBytes) && maxPayloadBytes > 0 ? maxPayloadBytes : 65536,
});

const redis = createClient({ url: redisUrl });
redis.on('error', (error) => fastify.log.error({ error }, 'Redis client error'));

fastify.register(cors, {
	origin: true,
});

fastify.get('/health', async () => {
	return { ok: true };
});

function nowIso() {
	return new Date().toISOString();
}

function withTimeout(promise, timeoutMs, label) {
	if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) return promise;

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

function assertFinitePositiveNumber(value, fallback) {
	return Number.isFinite(value) && value > 0 ? value : fallback;
}

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
	const maxEntries = assertFinitePositiveNumber(lkgMaxEntries, 5000);
	const ttl = assertFinitePositiveNumber(lkgTtlMs, 5 * 60 * 1000);

	lastKnownGoodHomeByUser.delete(userId);
	lastKnownGoodHomeByUser.set(userId, { value, expiresAtMs: Date.now() + ttl });

	while (lastKnownGoodHomeByUser.size > maxEntries) {
		const oldestKey = lastKnownGoodHomeByUser.keys().next().value;
		lastKnownGoodHomeByUser.delete(oldestKey);
	}
}

function addSecondsToIso(isoString, seconds) {
	return new Date(new Date(isoString).getTime() + seconds * 1000).toISOString();
}

function buildWidgetKey(userId, productId, widgetId) {
	return `widget:${userId}:${productId}:${widgetId}`;
}

function buildUserIndexKey(userId) {
	return `user:${userId}:widgets`;
}

function buildIdempotencyKey(productId, idempotencyKey) {
	return `idempo:${productId}:${idempotencyKey}`;
}

function buildRateLimitKey(productId, windowStartEpochSeconds) {
	return `rl:${productId}:${windowStartEpochSeconds}`;
}

function getHeader(request, name) {
	// Node lower-cases headers internally
	return request.headers[name];
}

function assertFinitePositiveInt(value, fallback) {
	return Number.isFinite(value) && value > 0 ? value : fallback;
}

function buildEmptyHomeResponse({ degraded, reason }) {
	return {
		schemaVersion: '1.0',
		generatedAt: nowIso(),
		greeting: 'Willkommen',
		widgets: [],
		...(degraded ? { meta: { degraded: true, reason: reason || 'unavailable', source: 'empty' } } : {}),
	};
}

function getContentLengthBytes(request) {
	const raw = request.headers['content-length'];
	if (raw === undefined) return undefined;
	const parsed = Number.parseInt(String(raw), 10);
	return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined;
}

function getWindowStartEpochSeconds(nowEpochSeconds, windowSeconds) {
	return Math.floor(nowEpochSeconds / windowSeconds) * windowSeconds;
}

async function enforceRateLimitOrThrow(productId) {
	const limit = assertFinitePositiveInt(ingestRateLimitPerMinute, 120);
	const nowEpochSeconds = Math.floor(Date.now() / 1000);
	const windowStart = getWindowStartEpochSeconds(nowEpochSeconds, ingestRateLimitWindowSeconds);
	const key = buildRateLimitKey(productId, windowStart);

	const count = await redis.incr(key);
	if (count === 1) {
		await redis.expire(key, ingestRateLimitWindowSeconds);
	}

	if (count > limit) {
		const retryAfterSeconds = windowStart + ingestRateLimitWindowSeconds - nowEpochSeconds;
		const error = new Error('Rate limit exceeded');
		error.statusCode = 429;
		error.retryAfterSeconds = Math.max(0, retryAfterSeconds);
		throw error;
	}
}

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

fastify.post(
	'/api/ingest',
	{
		schema: {
			body: ingestBodySchema,
		},
	},
	async (request, reply) => {
		const productId = String(getHeader(request, 'x-product-id') || '').trim();
		const apiKey = String(getHeader(request, 'x-api-key') || '').trim();

		if (!productId || !apiKey || ingestKeys[productId] !== apiKey) {
			return reply.status(403).send({ error: 'Forbidden' });
		}

		// Extra guard: if content-length is known and too big, fail fast.
		const contentLengthBytes = getContentLengthBytes(request);
		if (contentLengthBytes !== undefined && contentLengthBytes > maxPayloadBytes) {
			return reply.status(413).send({ error: 'Payload too large' });
		}

		try {
			await enforceRateLimitOrThrow(productId);
		} catch (error) {
			if (error && error.statusCode === 429) {
				reply.header('retry-after', String(error.retryAfterSeconds ?? 60));
				return reply.status(429).send({ error: 'Rate limit exceeded' });
			}
			request.log.error({ error }, 'Rate limit check failed');
			return reply.status(500).send({ error: 'Storage Failure' });
		}

		const idempotencyKey = String(getHeader(request, 'idempotency-key') || '').trim();
		if (idempotencyKey) {
			const idempoKey = buildIdempotencyKey(productId, idempotencyKey);
			const setResult = await redis.set(idempoKey, '1', {
				NX: true,
				EX: assertFinitePositiveInt(idempotencyTtlSeconds, 300),
			});
			if (setResult === null) {
				return reply.send({ status: 'duplicate' });
			}
		}

		const { userId, widgetData } = request.body;
		const widgetId = String(widgetData.widgetId);

		const generatedAt = nowIso();
		const softExpiresAt = addSecondsToIso(generatedAt, assertFinitePositiveInt(widgetSoftTtlSeconds, 60));
		const hardExpiresAt = addSecondsToIso(generatedAt, assertFinitePositiveInt(widgetHardTtlSeconds, 3600));

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

		try {
			const multi = redis.multi();
			multi.set(widgetKey, JSON.stringify(envelope), {
				EX: assertFinitePositiveInt(widgetHardTtlSeconds, 3600),
			});
			multi.sAdd(userIndexKey, widgetKey);
			multi.expire(userIndexKey, assertFinitePositiveInt(indexTtlSeconds, 604800));
			await multi.exec();

			return reply.send({ status: 'acknowledged' });
		} catch (error) {
			request.log.error({ error }, 'Failed to write snapshot');
			return reply.status(500).send({ error: 'Storage Failure' });
		}
	}
);

fastify.get('/api/home', async (request, reply) => {
	const userId = String(getHeader(request, 'x-user-id') || 'anon').trim();
	const userIndexKey = buildUserIndexKey(userId);

	try {
		const widgetKeys = await withTimeout(redis.sMembers(userIndexKey), redisReadTimeoutMs, 'redis.sMembers(userIndexKey)');
		if (!widgetKeys || widgetKeys.length === 0) {
			const response = buildEmptyHomeResponse({ degraded: false });
			lkgSet(userId, response);
			return reply.send(response);
		}

		const rawWidgets = await withTimeout(redis.mGet(widgetKeys), redisReadTimeoutMs, 'redis.mGet(widgetKeys)');

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
				widgets.push(JSON.parse(raw));
			} catch {
				expiredKeys.push(key);
			}
		}

		if (expiredKeys.length > 0) {
			// best-effort cleanup; do not fail request
			const redisCleanup = redis.sRem(userIndexKey, expiredKeys).catch((error) => {
				request.log.warn({ error }, 'Failed to cleanup expired index entries');
			});
			void redisCleanup;
		}

		widgets.sort((a, b) => (b.priority || 0) - (a.priority || 0));

		const response = {
			schemaVersion: '1.0',
			generatedAt: nowIso(),
			greeting: 'Willkommen zurück!',
			widgets,
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

async function start() {
	await redis.connect();
	const port = Number.parseInt(process.env.PORT || '3000', 10);
	const host = process.env.HOST || '0.0.0.0';

	fastify.addHook('onClose', async () => {
		try {
			await redis.quit();
		} catch {
			// ignore
		}
	});

	await fastify.listen({ port, host });
}

start().catch((error) => {
	fastify.log.error({ error }, 'Failed to start server');
	process.exit(1);
});
