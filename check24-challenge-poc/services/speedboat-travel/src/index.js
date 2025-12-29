/**
 * Speedboat-Travel Service
 * Product service for Travel vertical that pushes widgets to Home-Core
 */

const fastifyFactory = require('fastify');
const cors = require('@fastify/cors');

const config = require('./config');
const { registerRoutes } = require('./routes');

const fastify = fastifyFactory({ logger: true });

// Register CORS
fastify.register(cors, { origin: true });

// Register routes
registerRoutes(fastify, {
	coreUrl: config.coreUrl,
	ingestApiKey: config.ingestApiKey,
	productId: config.productId,
	productWebUrl: config.productWebUrl,
});

// EVENT-DRIVEN ARCHITECTURE:
// Widgets are pushed ONLY in response to explicit user actions (clicks, form submissions).
// Time-based polling (setInterval) was removed because:
// 1. Scalability: At 100k users × 5s interval = 20k RPS to Core (unsustainable)
// 2. UX: Unsolicited price/content changes reduce user trust and conversion
// 3. Resource efficiency: Widgets are already cached in Redis with TTL; no need for active refresh
// For production cache invalidation, products can use targeted endpoint: POST /api/invalidate/<userId>

async function start() {
	await fastify.listen({ port: config.port, host: config.host });
}

start().catch((error) => {
	fastify.log.error({ error }, 'Failed to start server');
	process.exit(1);
});
