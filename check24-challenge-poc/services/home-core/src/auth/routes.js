/**
 * Authentication routes: register, login, SSO handoff
 * ---------------------------------------------------------------	
 *  User-CRUD (Mongo), 
 * 	Passwort-Hashing, 
 * 	JWT-Erzeugung, 
 * 	SSO‑Handoff (Redis key setzen/getDel).
 * ------------------------------------------------------------------
 */

const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const config = require('../config');
const { buildHandoffKey } = require('../utils/keys');

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

function newHandoffCode() {
	return crypto.randomBytes(18).toString('base64url');
}

function registerAuthRoutes(fastify, { usersCollection, redis }) {
	// Register new user
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
				await usersCollection.insertOne({
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

	// Login existing user
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

	// Create SSO handoff code
	fastify.post('/api/auth/handoff', async (request, reply) => {
		const { resolveUserIdOrThrow } = require('./jwt');
		const userId = await resolveUserIdOrThrow(fastify, request, reply);
		if (!userId) return undefined;

		const code = newHandoffCode();
		const ttl =
			Number.isFinite(config.auth.handoffTtlSeconds) && config.auth.handoffTtlSeconds > 0 ? config.auth.handoffTtlSeconds : 60;

		try {
			await redis.set(buildHandoffKey(code), String(userId), { EX: ttl });
			return reply.send({ code, expiresInSeconds: ttl });
		} catch (error) {
			request.log.error({ error }, 'Failed to create auth handoff');
			return reply.status(503).send({ error: 'Auth unavailable' });
		}
	});

	// Exchange handoff code for JWT
	fastify.post(
		'/api/auth/exchange',
		{
			schema: { body: handoffExchangeSchema },
		},
		async (request, reply) => {
			const code = String(request.body.code || '').trim();
			if (!code) return reply.status(400).send({ error: 'Invalid payload' });

			try {
				const key = buildHandoffKey(code);
				let userId;
				if (typeof redis.getDel === 'function') {
					try {
						userId = await redis.getDel(key);
					} catch (error) {
						// Fallback for Redis versions without GETDEL
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
}

module.exports = { registerAuthRoutes };
