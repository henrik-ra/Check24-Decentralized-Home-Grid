/**
 * Central configuration module for home-core service.
 * All environment variables are loaded and validated here.
 */

const config = {
	redis: {
		url: process.env.REDIS_URL || 'redis://localhost:6379',
		readTimeoutMs: Number.parseInt(process.env.REDIS_READ_TIMEOUT_MS || '40', 10),
	},

	mongo: {
		uri: process.env.MONGODB_URI || '',
		dbName: process.env.MONGODB_DB || 'check24-home',
	},

	jwt: {
		secret: process.env.JWT_SECRET || '',
		expiresIn: process.env.JWT_EXPIRES_IN || '7d',
	},

	llm: {
		openRouterApiKey: process.env.OPENROUTER_API_KEY || '',
		openAiApiKey: process.env.OPENAI_API_KEY || '',
		get apiKey() {
			return this.openRouterApiKey || this.openAiApiKey;
		},
		get baseUrl() {
			const base =
				process.env.LLM_BASE_URL ||
				(this.openRouterApiKey ? 'https://openrouter.ai/api/v1' : process.env.OPENAI_BASE_URL) ||
				'https://api.openai.com/v1';
			return String(base).replace(/\/+$/g, '');
		},
		get model() {
			return (
				process.env.LLM_MODEL ||
				(this.openRouterApiKey ? process.env.OPENROUTER_MODEL || 'openai/gpt-4o-mini' : process.env.OPENAI_MODEL || 'gpt-4o-mini')
			);
		},
		siteUrl: process.env.OPENROUTER_SITE_URL || '',
		appName: process.env.OPENROUTER_APP_NAME || '',
		timeoutMs: Number.parseInt(process.env.WELCOME_TEXT_TIMEOUT_MS || '1200', 10),
		ttlSeconds: Number.parseInt(process.env.WELCOME_TEXT_TTL_SECONDS || '300', 10),
	},

	ingest: {
		maxPayloadBytes: Number.parseInt(process.env.MAX_INGEST_PAYLOAD_BYTES || '65536', 10),
		rateLimitPerMinute: Number.parseInt(process.env.INGEST_RATE_LIMIT_PER_MINUTE || '120', 10),
		rateLimitWindowSeconds: 60,
		widgetSoftTtlSeconds: Number.parseInt(process.env.WIDGET_SOFT_TTL_SECONDS || '60', 10),
		widgetHardTtlSeconds: Number.parseInt(process.env.WIDGET_HARD_TTL_SECONDS || '3600', 10),
		indexTtlSeconds: Number.parseInt(process.env.INDEX_TTL_SECONDS || '604800', 10), // 7 days
		idempotencyTtlSeconds: Number.parseInt(process.env.IDEMPOTENCY_TTL_SECONDS || '300', 10),
	},

	home: {
		minWidgets: Number.parseInt(process.env.MIN_WIDGETS || '3', 10),
		lkgTtlMs: Number.parseInt(process.env.LKG_TTL_MS || `${5 * 60 * 1000}`, 10), // 5 min
		lkgMaxEntries: Number.parseInt(process.env.LKG_MAX_ENTRIES || '5000', 10),
	},

	auth: {
		handoffTtlSeconds: Number.parseInt(process.env.AUTH_HANDOFF_TTL_SECONDS || '60', 10),
	},

	products: {
		travelWebUrl: process.env.TRAVEL_WEB_URL || '',
		dslWebUrl: process.env.DSL_WEB_URL || '',
		insuranceWebUrl: process.env.INSURANCE_WEB_URL || '',
	},
};

module.exports = config;
