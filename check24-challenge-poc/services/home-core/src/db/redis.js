/**
 * Redis client setup and connection
 */

const { createClient } = require('redis');
const config = require('../config');

async function connectRedis(logger) {
	const redis = createClient({ url: config.redis.url });
	redis.on('error', (error) => logger.error({ error }, 'Redis client error'));
	await redis.connect();
	logger.info({ url: config.redis.url }, 'Redis connected');
	return redis;
}

module.exports = { connectRedis };
