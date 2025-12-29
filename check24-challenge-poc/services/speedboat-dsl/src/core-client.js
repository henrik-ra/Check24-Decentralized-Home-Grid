/**
 * Home-Core API Client for DSL
 */

const axios = require('axios');
const crypto = require('crypto');

async function sendSignal({ userId, productId, weight, offerId, offerTitle, offerSubtitle, coreUrl, ingestApiKey, logger }) {
	try {
		await axios.post(
			coreUrl + '/api/signals',
			{ userId, signal: 'interest', weight, offerId, offerTitle, offerSubtitle },
			{
				headers: {
					'x-product-id': productId.toUpperCase(),
					'x-api-key': ingestApiKey,
				},
				timeout: 2000,
			}
		);
		logger.info({ userId, productId, weight, hasOfferTitle: !!offerTitle, hasOfferSubtitle: !!offerSubtitle }, '[speedboat] signal sent');
	} catch (error) {
		logger.error({ error: error.message }, '[speedboat] failed to send signal');
	}
}

async function pushWidget({ userId, productId, widgetId, priority, components, data, coreUrl, ingestApiKey, logger }) {
	const payload = {
		userId,
		widgetData: {
			widgetId,
			type: 'hero_banner',
			priority,
			components,
			data,
		},
	};

	try {
		await axios.post(coreUrl + '/api/ingest', payload, {
			headers: {
				'x-product-id': productId.toUpperCase(),
				'x-api-key': ingestApiKey,
				'idempotency-key': crypto.randomUUID(),
			},
			timeout: 2000,
		});
		logger.info({ userId, productId, widgetId }, '[speedboat] widget pushed');
	} catch (error) {
		logger.error({ error: error.message }, '[speedboat] core unreachable');
	}
}

module.exports = { sendSignal, pushWidget };
