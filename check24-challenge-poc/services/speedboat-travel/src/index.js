const axios = require('axios');
const crypto = require('crypto');

const coreUrl = (process.env.CORE_URL || 'http://localhost:3000').replace(/\/$/, '');
const productId = process.env.PRODUCT_ID || 'travel';
const ingestApiKey = process.env.INGEST_API_KEY || 'dev-secret-123';
const userIds = (process.env.USER_IDS || '1,2')
	.split(',')
	.map((value) => value.trim())
	.filter(Boolean);

const widgetId = process.env.WIDGET_ID || 'travel.hero.v1';
const pushIntervalMs = Number.parseInt(process.env.PUSH_INTERVAL_MS || '5000', 10);

async function pushUpdateForUser(userId) {
	const price = Math.floor(Math.random() * 200) + 50;

	const payload = {
		userId,
		widgetData: {
			widgetId,
			type: 'hero_banner',
			priority: 100,
			components: [
				{
					type: 'HeroBanner',
					props: {
						title: `Mallorca Deal für User ${userId}`,
						subtitle: 'Inklusive Flug & Hotel',
						price: `${price} €`,
						imageUrl: 'https://example.com/mallorca.jpg',
						cta: { label: 'Ansehen', deeplink: 'check24://travel/offer/123' },
					},
				},
			],
			data: {
				price: `${price} €`,
			},
		},
	};

	await axios.post(`${coreUrl}/api/ingest`, payload, {
		headers: {
			'x-product-id': productId,
			'x-api-key': ingestApiKey,
			'idempotency-key': crypto.randomUUID(),
		},
		timeout: 2000,
	});
}

async function tick() {
	for (const userId of userIds) {
		try {
			await pushUpdateForUser(userId);
			// eslint-disable-next-line no-console
			console.log(`[speedboat-travel] pushed snapshot for user=${userId}`);
		} catch (error) {
			// eslint-disable-next-line no-console
			console.log(`[speedboat-travel] core unreachable (${error.message})`);
		}
	}
}

// eslint-disable-next-line no-console
console.log(`[speedboat-travel] started coreUrl=${coreUrl} productId=${productId} intervalMs=${pushIntervalMs}`);
tick();
setInterval(tick, Number.isFinite(pushIntervalMs) && pushIntervalMs > 0 ? pushIntervalMs : 5000);
