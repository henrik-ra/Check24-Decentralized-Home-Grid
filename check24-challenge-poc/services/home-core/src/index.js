const cors = require('@fastify/cors');
const fastifyJwt = require('@fastify/jwt');
const fastifyFactory = require('fastify');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { MongoClient } = require('mongodb');
const { createClient } = require('redis');

function normalizeProductIdToEnvSuffix(productId) {
	return String(productId)
		.toUpperCase()
		.replace(/[^A-Z0-9]+/g, '_')
		.replace(/^_+|_+$/g, '');
}

const DEFAULT_INGEST_KEYS_BY_SUFFIX = {
	TRAVEL: 'dev-secret-123',
	DSL: 'dev-secret-123',
	INSURANCE: 'dev-secret-123',
	ENERGY: 'dev-secret-123',
	FINANCE: 'dev-secret-123',
	SHOPPING: 'dev-secret-123',
};

function getIngestKeyForProduct(productId) {
	const suffix = normalizeProductIdToEnvSuffix(productId);
	if (!suffix) return undefined;
	// Debug logging for troubleshooting
	const envKey = process.env[`INGEST_KEY_${suffix}`];
	const defaultKey = DEFAULT_INGEST_KEYS_BY_SUFFIX[suffix];
	if (!envKey && !defaultKey) {
		console.warn(`No ingest key found for product ${productId} (suffix: ${suffix})`);
	}
	return envKey || defaultKey;
}

const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';

// Auth/identity (control plane)
// This PoC runs in "auth-required" mode: /api/home requires a JWT.
// Configure with MONGODB_URI + JWT_SECRET.
const mongoDbUri = process.env.MONGODB_URI || '';
const mongoDbName = process.env.MONGODB_DB || 'check24-home';
const jwtSecret = process.env.JWT_SECRET || '';
const jwtExpiresIn = process.env.JWT_EXPIRES_IN || '7d';

let mongoClient;
let usersCollection;

// IMPORTANT: Ingest auth is configured per product via env vars:
// - INGEST_KEY_TRAVEL
// - INGEST_KEY_INSURANCE_LIABILITY
// etc.

// Read-path resilience settings
const redisReadTimeoutMs = Number.parseInt(process.env.REDIS_READ_TIMEOUT_MS || '40', 10);
const lkgTtlMs = Number.parseInt(process.env.LKG_TTL_MS || `${5 * 60 * 1000}` /* 5 min */, 10);
const lkgMaxEntries = Number.parseInt(process.env.LKG_MAX_ENTRIES || '5000', 10);

const widgetSoftTtlSeconds = Number.parseInt(process.env.WIDGET_SOFT_TTL_SECONDS || '60', 10);
const widgetHardTtlSeconds = Number.parseInt(process.env.WIDGET_HARD_TTL_SECONDS || '3600', 10);
const indexTtlSeconds = Number.parseInt(process.env.INDEX_TTL_SECONDS || '604800', 10); // 7 days
const idempotencyTtlSeconds = Number.parseInt(process.env.IDEMPOTENCY_TTL_SECONDS || '300', 10);
const maxPayloadBytes = Number.parseInt(process.env.MAX_INGEST_PAYLOAD_BYTES || '65536', 10); // 64KB

// Optional LLM-based welcome text (best-effort; falls back to local templates)
// Supports either:
// - OpenAI directly: set OPENAI_API_KEY (optional: OPENAI_BASE_URL, OPENAI_MODEL)
// - OpenRouter: set OPENROUTER_API_KEY (optional: OPENROUTER_MODEL, OPENROUTER_SITE_URL, OPENROUTER_APP_NAME)
const openRouterApiKey = process.env.OPENROUTER_API_KEY || '';
const openAiApiKey = process.env.OPENAI_API_KEY || '';

const llmApiKey = openRouterApiKey || openAiApiKey;
const llmBaseUrl = String(
	process.env.LLM_BASE_URL ||
		(openRouterApiKey ? 'https://openrouter.ai/api/v1' : process.env.OPENAI_BASE_URL) ||
		'https://api.openai.com/v1'
).replace(/\/+$/g, '');
const llmModel =
	process.env.LLM_MODEL ||
	(openRouterApiKey ? process.env.OPENROUTER_MODEL || 'openai/gpt-4o-mini' : process.env.OPENAI_MODEL || 'gpt-4o-mini');
const openRouterSiteUrl = process.env.OPENROUTER_SITE_URL || '';
const openRouterAppName = process.env.OPENROUTER_APP_NAME || '';
const welcomeTextTimeoutMs = Number.parseInt(process.env.WELCOME_TEXT_TIMEOUT_MS || '1200', 10);
const welcomeTextTtlSeconds = Number.parseInt(process.env.WELCOME_TEXT_TTL_SECONDS || '300', 10);

// Rate limiting (per productId)
const ingestRateLimitPerMinute = Number.parseInt(process.env.INGEST_RATE_LIMIT_PER_MINUTE || '120', 10);
const ingestRateLimitWindowSeconds = 60;

const fastify = fastifyFactory({
	logger: true,
	// Enforce max request payload size at the framework level.
	bodyLimit: Number.isFinite(maxPayloadBytes) && maxPayloadBytes > 0 ? maxPayloadBytes : 65536,
});

if (!jwtSecret) {
	// JWT is required for /api/home in this PoC. Running without a configured secret would be insecure.
	// Fail fast so deployments don't silently start with a broken/weak auth configuration.
	// eslint-disable-next-line no-console
	console.error('Missing required env var: JWT_SECRET');
	process.exit(1);
}

const redis = createClient({ url: redisUrl });
redis.on('error', (error) => fastify.log.error({ error }, 'Redis client error'));

fastify.register(cors, {
	origin: true,
});

fastify.register(fastifyJwt, {
	secret: jwtSecret,
	sign: { expiresIn: jwtExpiresIn },
});

fastify.get('/health', async () => {
	return { ok: true };
});

function getBearerToken(request) {
	const header = String(request.headers['authorization'] || '').trim();
	if (!header) return undefined;
	const match = header.match(/^Bearer\s+(.+)$/i);
	return match ? match[1].trim() : undefined;
}

async function resolveUserIdOrThrow(request, reply) {
	const bearerToken = getBearerToken(request);
	if (!bearerToken) {
		reply.status(401).send({ error: 'Unauthorized' });
		return undefined;
	}

	try {
		const payload = await fastify.jwt.verify(bearerToken);
		const sub = String(payload?.sub || '').trim();
		if (!sub) {
			reply.status(401).send({ error: 'Unauthorized' });
			return undefined;
		}
		return sub;
	} catch {
		reply.status(401).send({ error: 'Unauthorized' });
		return undefined;
	}
}

const authBodySchema = {
	type: 'object',
	required: ['email', 'password'],
	additionalProperties: false,
	properties: {
		email: { type: 'string', minLength: 3, maxLength: 254 },
		password: { type: 'string', minLength: 6, maxLength: 200 },
	},
};

const handoffExchangeSchema = {
	type: 'object',
	required: ['code'],
	additionalProperties: false,
	properties: {
		code: { type: 'string', minLength: 10, maxLength: 200 },
	},
};

const authHandoffTtlSeconds = Number.parseInt(process.env.AUTH_HANDOFF_TTL_SECONDS || '60', 10);

function newHandoffCode() {
	return crypto.randomBytes(18).toString('base64url');
}

function handoffKey(code) {
	return `auth:handoff:${code}`;
}

fastify.post(
	'/api/auth/register',
	{
		schema: { body: authBodySchema },
	},
	async (request, reply) => {
		if (!usersCollection || !fastify.jwt) {
			return reply.status(503).send({ error: 'Auth unavailable' });
		}

		const email = String(request.body.email || '').trim().toLowerCase();
		const password = String(request.body.password || '');
		if (!email || !password) {
			return reply.status(400).send({ error: 'Invalid payload' });
		}

		const passwordHash = await bcrypt.hash(password, 10);
		try {
			const insertResult = await usersCollection.insertOne({
				email,
				passwordHash,
				createdAt: new Date(),
			});
			const token = fastify.jwt.sign({ sub: email });
			return reply.send({ token, user: { id: email, email } });
		} catch (error) {
			if (error && error.code === 11000) {
				return reply.status(409).send({ error: 'Email already registered' });
			}
			request.log.error({ error }, 'Failed to register user');
			return reply.status(500).send({ error: 'Auth failure' });
		}
	}
);

fastify.post(
	'/api/auth/login',
	{
		schema: { body: authBodySchema },
	},
	async (request, reply) => {
		if (!usersCollection || !fastify.jwt) {
			return reply.status(503).send({ error: 'Auth unavailable' });
		}

		const email = String(request.body.email || '').trim().toLowerCase();
		const password = String(request.body.password || '');
		if (!email || !password) {
			return reply.status(400).send({ error: 'Invalid payload' });
		}

		try {
			const user = await usersCollection.findOne({ email });
			if (!user) {
				return reply.status(401).send({ error: 'Invalid credentials' });
			}
			const ok = await bcrypt.compare(password, String(user.passwordHash || ''));
			if (!ok) {
				return reply.status(401).send({ error: 'Invalid credentials' });
			}

			const token = fastify.jwt.sign({ sub: email });
			return reply.send({ token, user: { id: email, email } });
		} catch (error) {
			request.log.error({ error }, 'Failed to login user');
			return reply.status(500).send({ error: 'Auth failure' });
		}
	}
);

// ---------------------------------
// Cross-origin SSO handoff (PoC)
// ---------------------------------
// Real CHECK24 would typically use cookie-based SSO on a shared parent domain.
// In this PoC, product sites are separate origins, so we mint a short-lived one-time code
// that a product site can exchange for a JWT.

fastify.post('/api/auth/handoff', async (request, reply) => {
	const userId = await resolveUserIdOrThrow(request, reply);
	if (!userId) return undefined;

	const code = newHandoffCode();
	const ttl = Number.isFinite(authHandoffTtlSeconds) && authHandoffTtlSeconds > 0 ? authHandoffTtlSeconds : 60;

	try {
		await redis.set(handoffKey(code), String(userId), { EX: ttl });
		return reply.send({ code, expiresInSeconds: ttl });
	} catch (error) {
		request.log.error({ error }, 'Failed to create auth handoff');
		return reply.status(503).send({ error: 'Auth unavailable' });
	}
});

fastify.post(
	'/api/auth/exchange',
	{
		schema: { body: handoffExchangeSchema },
	},
	async (request, reply) => {
		const code = String(request.body.code || '').trim();
		if (!code) return reply.status(400).send({ error: 'Invalid payload' });

		try {
			const key = handoffKey(code);
			let userId;
			if (typeof redis.getDel === 'function') {
				try {
					userId = await redis.getDel(key);
				} catch (error) {
					// Some Redis providers/versions don't support GETDEL.
					// Fall back to GET + DEL (best-effort) so SSO still works.
					request.log.warn({ error: error?.message }, 'Redis GETDEL failed; falling back to GET+DEL');
					userId = await redis.get(key);
					if (userId) await redis.del(key);
				}
			} else {
				userId = await redis.get(key);
				if (userId) await redis.del(key);
			}

			if (!userId) {
				return reply.status(400).send({ error: 'Invalid or expired code' });
			}

			const token = fastify.jwt.sign({ sub: String(userId) });
			return reply.send({ token, user: { id: String(userId), email: String(userId) } });
		} catch (error) {
			request.log.error({ error }, 'Failed to exchange auth handoff');
			return reply.status(503).send({ error: 'Auth unavailable' });
		}
	}
);

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

function buildUserProductLatestWidgetKey(userId, productId) {
	return `user:${userId}:product:${productId}:latestWidgetKey`;
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

const minWidgets = Number.parseInt(process.env.MIN_WIDGETS || '3', 10);

function svgDataUrl(options) {
	const width = Number.isFinite(options?.width) ? options.width : 80;
	const height = Number.isFinite(options?.height) ? options.height : 80;
	const text = String(options?.text ?? '').slice(0, 12);
	const bg = String(options?.bg ?? '#eeeeee');
	const fg = String(options?.fg ?? '#333333');
	const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
	<rect width="100%" height="100%" fill="${bg}" />
	<text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" fill="${fg}" font-family="Arial, sans-serif" font-size="18">${text}</text>
</svg>`;
	return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

function buildEmptyHomeResponse({ degraded, reason }) {
	const widgets = ensureMinWidgets([], assertFinitePositiveInt(minWidgets, 3));
	return {
		schemaVersion: '1.0',
		generatedAt: nowIso(),
		greeting: 'Willkommen',
		welcomeText: 'Schön, dass du da bist. Entdecke heute neue Angebote.',
		widgets,
		...(degraded ? { meta: { degraded: true, reason: reason || 'unavailable', source: 'empty' } } : {}),
	};
}

function buildBaselineWidgets() {
	// Home-owned baseline widgets (neutral, non-personalized)
	// Purpose: guarantee minimum content without pushing to all users.
	const productId = 'BASELINE';
	const generatedAt = nowIso();
	const softExpiresAt = addSecondsToIso(generatedAt, assertFinitePositiveInt(widgetSoftTtlSeconds, 60));
	const hardExpiresAt = addSecondsToIso(generatedAt, assertFinitePositiveInt(widgetHardTtlSeconds, 3600));

	const normalizeUrl = (value) => {
		const v = String(value || '').trim();
		if (!v) return '';
		return v.endsWith('/') ? v.slice(0, -1) : v;
	};

	const withOfferPath = (baseUrl, fallbackDeeplink) => {
		const base = normalizeUrl(baseUrl);
		return base ? `${base}/offer/123` : fallbackDeeplink;
	};

	const travelOfferUrl = withOfferPath(process.env.TRAVEL_WEB_URL, 'check24://travel/offer/123');
	const dslOfferUrl = withOfferPath(process.env.DSL_WEB_URL, 'check24://dsl/offer/123');
	const insuranceOfferUrl = withOfferPath(process.env.INSURANCE_WEB_URL, 'check24://insurance/offer/123');

	const travelIcon = 'https://images.unsplash.com/photo-1488646953014-85cb44e25828?w=80&h=80&fit=crop';
	const dslIcon = 'https://images.unsplash.com/photo-1451187580459-43490279c0fa?w=80&h=80&fit=crop';
	const insuranceIcon = 'https://images.unsplash.com/photo-1454165804606-c3d57bc86b40?w=80&h=80&fit=crop';

	return [
		{
			schemaVersion: '1.0',
			widgetId: 'baseline.travel.v1',
			productId,
			type: 'compact_row',
			priority: 30,
			components: [
				{
					type: 'CompactRow',
					props: {
						title: 'Urlaub finden',
						subtitle: 'Top Pauschalreisen entdecken',
						imageUrl: travelIcon,
						price: 'Top Deals',
						cta: { label: 'Ansehen', action: 'deeplink', deeplink: travelOfferUrl },
					},
				},
			],
			data: { baseline: true },
			softExpiresAt,
			hardExpiresAt,
			generatedAt,
			meta: { isBaseline: true },
		},
		{
			schemaVersion: '1.0',
			widgetId: 'baseline.dsl.v1',
			productId,
			type: 'compact_row',
			priority: 20,
			components: [
				{
					type: 'CompactRow',
					props: {
						title: 'Internet vergleichen',
						subtitle: 'Tarife für Zuhause prüfen',
						imageUrl: dslIcon,
						price: 'Schnell & günstig',
						cta: { label: 'Vergleichen', action: 'deeplink', deeplink: dslOfferUrl },
					},
				},
			],
			data: { baseline: true },
			softExpiresAt,
			hardExpiresAt,
			generatedAt,
			meta: { isBaseline: true },
		},
		{
			schemaVersion: '1.0',
			widgetId: 'baseline.insurance.v1',
			productId,
			type: 'compact_row',
			priority: 10,
			components: [
				{
					type: 'CompactRow',
					props: {
						title: 'Versicherung prüfen',
						subtitle: 'Potenzial sparen entdecken',
						imageUrl: insuranceIcon,
						price: 'Sparpotenzial',
						cta: { label: 'Berechnen', action: 'deeplink', deeplink: insuranceOfferUrl },
					},
				},
			],
			data: { baseline: true },
			softExpiresAt,
			hardExpiresAt,
			generatedAt,
			meta: { isBaseline: true },
		},
	];
}

function ensureMinWidgets(widgets, minCount) {
	const safeWidgets = Array.isArray(widgets) ? [...widgets] : [];
	const min = assertFinitePositiveInt(Number(minCount), 3);
	if (safeWidgets.length >= min) return safeWidgets;

	const existingIds = new Set(safeWidgets.map((w) => `${w.productId}:${w.widgetId}`));
	for (const candidate of buildBaselineWidgets()) {
		const id = `${candidate.productId}:${candidate.widgetId}`;
		if (existingIds.has(id)) continue;
		safeWidgets.push(candidate);
		existingIds.add(id);
		if (safeWidgets.length >= min) break;
	}

	return safeWidgets;
}

function normalizeWelcomeText(value) {
	const text = String(value || '')
		.replace(/\s+/g, ' ')
		.replace(/^\s+|\s+$/g, '')
		.replace(/^["'`]+|["'`]+$/g, '');
	if (!text) return '';
	return text.length > 160 ? `${text.slice(0, 157)}...` : text;
}

function getInterestDisplayName(productId) {
	const id = String(productId || '').trim().toLowerCase();
	if (!id) return undefined;
	const map = {
		travel: 'Reisen',
		dsl: 'Internet',
		insurance: 'Versicherung',
	};
	return map[id] || id.toUpperCase();
}

function getTopInterestsFromAffinities(affinities, limit) {
	const entries = Object.entries(affinities || {})
		.map(([productId, rawScore]) => {
			const score = Number.parseFloat(String(rawScore));
			return { productId, score: Number.isFinite(score) ? score : 0 };
		})
		.filter((x) => x.score > 0);

	entries.sort((a, b) => b.score - a.score);
	const capped = entries.slice(0, assertFinitePositiveInt(limit, 2));
	return capped
		.map((x) => ({ productId: x.productId, score: x.score, label: getInterestDisplayName(x.productId) }))
		.filter((x) => Boolean(x.label));
}

function buildFallbackWelcomeText(interests) {
	const top = interests?.[0]?.label;
	if (!top) {
		const genericVariants = [
			'Schön, dass du da bist! Heute ist ein guter Tag für neue Entdeckungen. 🎯',
			'Willkommen zurück! Bereit für frische Inspirationen?',
			'Hey! Lass uns gemeinsam die besten Deals finden.',
			'Perfektes Timing! Dein persönlicher Feed wartet auf dich.',
			'Na, auf der Suche nach dem perfekten Angebot? Du bist hier richtig!',
			'Willkommen! Heute haben wir ein paar Überraschungen für dich parat.',
			'Schön, dich zu sehen! Stöber durch deine persönlichen Highlights.',
		];
		return genericVariants[Math.floor(Math.random() * genericVariants.length)];
	}

	const variants = [
		`Willkommen zurück! Lust auf frische ${top}-Highlights?`,
		`Hey! Wir haben spannende ${top}-Ideen für dich.`,
		`Schön, dich zu sehen – wie wär's mit ${top}?`,
		`Willkommen! Dein ${top}-Feed ist heute besonders interessant.`,
		`Perfekt! Genau der richtige Moment für ${top}-Inspirationen.`,
		`Na, bereit für neue ${top}-Entdeckungen? Los geht's!`,
	];
	return variants[Math.floor(Math.random() * variants.length)];
}

async function generateWelcomeTextWithLlm(interests) {
	if (!llmApiKey) return '';
	const interestLabels = (interests || []).map((x) => x.label).filter(Boolean);
	if (interestLabels.length === 0) return '';

	const prompt = {
		model: llmModel,
		messages: [
			{
				role: 'system',
				content:
					'Du bist ein Copywriter für eine CHECK24-ähnliche Home-Seite. Antworte auf Deutsch in 1 kurzen Satz (max 140 Zeichen), ohne Emojis, ohne Anführungszeichen, ohne Markdown.',
			},
			{
				role: 'user',
				content: `Generiere einen kreativen Willkommenstext basierend auf diesen Interessen: ${interestLabels.join(', ')}. Erwähne höchstens ein Thema.`,
			},
		],
		temperature: 0.8,
	};

	const headers = {
		'content-type': 'application/json',
		authorization: `Bearer ${llmApiKey}`,
	};
	if (openRouterApiKey && openRouterSiteUrl) headers['HTTP-Referer'] = openRouterSiteUrl;
	if (openRouterApiKey && openRouterAppName) headers['X-Title'] = openRouterAppName;

	const response = await fetch(`${llmBaseUrl}/chat/completions`, {
		method: 'POST',
		headers,
		body: JSON.stringify(prompt),
	});

	if (!response.ok) {
		const bodyText = await response.text().catch(() => '');
		throw new Error(`LLM failed: ${response.status}${bodyText ? ` - ${bodyText}` : ''}`);
	}

	const data = await response.json();
	const text = data?.choices?.[0]?.message?.content;
	return normalizeWelcomeText(text);
}

async function getOrGenerateWelcomeText(request, userId, affinities) {
	// Caching disabled: generate fresh welcome text on every request for dynamic personalization
	const interests = getTopInterestsFromAffinities(affinities, 2);
	let text = '';
	try {
		text = await withTimeout(
			generateWelcomeTextWithLlm(interests),
			assertFinitePositiveInt(welcomeTextTimeoutMs, 1200),
			'welcomeText.llm'
		);
	} catch (error) {
		request.log.warn({ error: error?.message }, 'Welcome text LLM generation failed; falling back');
	}
	if (!text) text = buildFallbackWelcomeText(interests);

	return text;
}

function buildAffinityKey(userId) {
	return `affinity:${userId}`;
}

const signalBodySchema = {
	type: 'object',
	required: ['userId', 'signal', 'weight'],
	additionalProperties: false,
	properties: {
		userId: { type: 'string', minLength: 1, maxLength: 128 },
		signal: { type: 'string', enum: ['interest'] },
		weight: { type: 'number', minimum: 0.1, maximum: 100 },
	},
};

fastify.post(
	'/api/signals',
	{
		schema: {
			body: signalBodySchema,
		},
	},
	async (request, reply) => {
		const productId = String(getHeader(request, 'x-product-id') || '').trim();
		const apiKey = String(getHeader(request, 'x-api-key') || '').trim();
		const expectedKey = productId ? String(getIngestKeyForProduct(productId) || '').trim() : '';

		if (!productId || !apiKey || !expectedKey || expectedKey !== apiKey) {
			return reply.status(403).send({ error: 'Forbidden' });
		}

		const { userId, weight } = request.body;
		const affinityKey = buildAffinityKey(userId);

		try {
			await redis.hIncrByFloat(affinityKey, productId, weight);
			await redis.expire(affinityKey, 3600);
			return reply.send({ status: 'signal_processed', productId, weight });
		} catch (error) {
			request.log.error({ error }, 'Failed to process signal');
			return reply.status(500).send({ error: 'Signal Failure' });
		}
	}
);

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
		const expectedKey = productId ? String(getIngestKeyForProduct(productId) || '').trim() : '';

		if (!productId || !apiKey || !expectedKey || expectedKey !== apiKey) {
			request.log.warn({ productId, hasApiKey: !!apiKey, expectedKeyFound: !!expectedKey, match: expectedKey === apiKey }, 'Ingest Forbidden');
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
		const latestWidgetKeyKey = buildUserProductLatestWidgetKey(userId, productId);

		try {
			const previousWidgetKey = await redis.get(latestWidgetKeyKey);
			const shouldRemovePrevious =
				previousWidgetKey && typeof previousWidgetKey === 'string' && previousWidgetKey !== widgetKey;

			const multi = redis.multi();
			multi.set(widgetKey, JSON.stringify(envelope), {
				EX: assertFinitePositiveInt(widgetHardTtlSeconds, 3600),
			});
			multi.sAdd(userIndexKey, widgetKey);
			multi.expire(userIndexKey, assertFinitePositiveInt(indexTtlSeconds, 604800));
			multi.set(latestWidgetKeyKey, widgetKey, { EX: assertFinitePositiveInt(indexTtlSeconds, 604800) });
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

fastify.get('/api/home', async (request, reply) => {
	const userId = await resolveUserIdOrThrow(request, reply);
	if (!userId) return;
	const userIndexKey = buildUserIndexKey(userId);
	const affinityKey = buildAffinityKey(userId);

	try {
		const [widgetKeys, affinities] = await Promise.all([
			withTimeout(redis.sMembers(userIndexKey), redisReadTimeoutMs, 'redis.sMembers(userIndexKey)'),
			withTimeout(redis.hGetAll(affinityKey), redisReadTimeoutMs, 'redis.hGetAll(affinityKey)'),
		]);
		
		const welcomeText = await getOrGenerateWelcomeText(request, userId, affinities);
		
		if (!widgetKeys || widgetKeys.length === 0) {
			const response = buildEmptyHomeResponse({ degraded: false });
			response.welcomeText = welcomeText;
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
			// best-effort cleanup; do not fail request
			const redisCleanup = redis.sRem(userIndexKey, expiredKeys).catch((error) => {
				request.log.warn({ error }, 'Failed to cleanup expired index entries');
			});
			void redisCleanup;
		}

		widgets.sort((a, b) => (b.priority || 0) - (a.priority || 0));
		const filledWidgets = ensureMinWidgets(widgets, assertFinitePositiveInt(minWidgets, 3));

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

async function start() {
	if (!mongoDbUri) {
		throw new Error('Missing required env var MONGODB_URI');
	}
	if (!jwtSecret) {
		throw new Error('Missing required env var JWT_SECRET');
	}

	await redis.connect();

	mongoClient = new MongoClient(mongoDbUri);
	await mongoClient.connect();
	const db = mongoClient.db(mongoDbName);
	usersCollection = db.collection('users');
	await usersCollection.createIndex({ email: 1 }, { unique: true });
	fastify.log.info({ mongoDbName }, 'MongoDB connected');
	const port = Number.parseInt(process.env.PORT || '3000', 10);
	const host = process.env.HOST || '0.0.0.0';

	fastify.addHook('onClose', async () => {
		try {
			await redis.quit();
		} catch {
			// ignore
		}
		try {
			await mongoClient?.close();
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
