/**
 * Home-Core Service
 * Main entry point for the CHECK24 Home PoC backend
 */

const fastifyFactory = require('fastify');
const cors = require('@fastify/cors');
const fastifyJwt = require('@fastify/jwt');

const config = require('./config');
const { connectRedis } = require('./db/redis');
const { connectMongo, closeMongo } = require('./db/mongo');
const { registerAuthRoutes } = require('./auth/routes');
const { registerIngestRoutes } = require('./ingest/routes');
const { registerHomeRoutes } = require('./home/routes');

const fastify = fastifyFactory({
	logger: true,
	bodyLimit: config.ingest.maxPayloadBytes,
});

// Validate critical configuration
if (!config.jwt.secret) {
	console.error('Missing required env var: JWT_SECRET');
	process.exit(1);
}

// Register core plugins
fastify.register(cors, { origin: true });
fastify.register(fastifyJwt, {
	secret: config.jwt.secret,
	sign: { expiresIn: config.jwt.expiresIn },
});

// Health check endpoint
fastify.get('/health', async () => ({ ok: true }));

async function start() {
	if (!config.mongo.uri) {
		throw new Error('Missing required env var MONGODB_URI');
	}

	// Connect to databases
	const redis = await connectRedis(fastify.log);
	const { usersCollection } = await connectMongo(fastify.log);

	// Register route modules
	registerAuthRoutes(fastify, { usersCollection, redis });
	registerIngestRoutes(fastify, { redis });
	registerHomeRoutes(fastify, { redis });

	// Graceful shutdown
	fastify.addHook('onClose', async () => {
		try {
			await redis.quit();
		} catch {
			// ignore
		}
		await closeMongo();
	});

	const port = Number.parseInt(process.env.PORT || '3000', 10);
	const host = process.env.HOST || '0.0.0.0';
	await fastify.listen({ port, host });
}

start().catch((error) => {
	fastify.log.error({ error }, 'Failed to start server');
	process.exit(1);
});
