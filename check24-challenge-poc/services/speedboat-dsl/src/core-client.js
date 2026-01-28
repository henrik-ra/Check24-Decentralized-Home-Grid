
// Home-Core API client for Speedboat-DSL
// Handles push-based widget and signal delivery to Home-Core backend


const axios = require('axios'); // HTTP client
const crypto = require('crypto'); // For keys

// Pushes a user interaction signal (e.g. interest/click) to Home-Core
async function sendSignal({ userId, productId, weight, offerId, offerTitle, offerSubtitle, coreUrl, ingestApiKey, logger }) {
	try {
		await axios.post(
			coreUrl + '/api/signals',
			{ userId, 
				signal: 'interest', 
				weight, 
				offerId, 
				offerTitle, 
				offerSubtitle},
			{
				headers: {
					'x-product-id': productId.toUpperCase(), // Product context for Home-Core
					'x-api-key': ingestApiKey, // Auth for ingestion
				},
				timeout: 2000, // Fail fast if Home-Core is slow
			}
		);
		// Log success with context (for audit/tracing)
		logger.info({ userId, productId, weight, hasOfferTitle: !!offerTitle, hasOfferSubtitle: !!offerSubtitle }, '[speedboat] signal sent');
	} catch (error) {
		// Log error, but don't throw (non-blocking UX)
		logger.error({ error: error.message }, '[speedboat] failed to send signal');
	}
}


// Pushes a widget (SDUI block) to Home-Core for a user
async function pushWidget({ userId, productId, widgetId, priority, components, data, coreUrl, ingestApiKey, logger }) {
	const payload = {
		userId,
		widgetData: {
			widgetId,
			type: 'hero_banner', // Widget type (extend for more types)
			priority,
			components,
			data,
		},
	};

	try {
		await axios.post(coreUrl + '/api/ingest', payload, {
			headers: {
				'x-product-id': productId.toUpperCase(), // Product context for Home-Core
				'x-api-key': ingestApiKey, // Auth for ingestion
				'idempotency-key': crypto.randomUUID(), // Prevents duplicate widget ingestion
			},
			timeout: 2000, // Fail fast if Home-Core is slow
		});
		// Log success for traceability
		logger.info({ userId, productId, widgetId }, '[speedboat] widget pushed');
	} catch (error) {
		// Log error, but don't throw (non-blocking UX)
		logger.error({ error: error.message }, '[speedboat] core unreachable');
	}
}


// Export API for use in routes/business logic
module.exports = { sendSignal, pushWidget };
