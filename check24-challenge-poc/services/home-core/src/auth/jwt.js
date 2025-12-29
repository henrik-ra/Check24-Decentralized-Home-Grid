/**
 * JWT utilities for authentication
 */

function getBearerToken(request) {
	const header = String(request.headers['authorization'] || '').trim();
	if (!header) return undefined;
	const match = header.match(/^Bearer\s+(.+)$/i);
	return match ? match[1].trim() : undefined;
}

async function resolveUserIdOrThrow(fastify, request, reply) {
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

module.exports = {
	getBearerToken,
	resolveUserIdOrThrow,
};
