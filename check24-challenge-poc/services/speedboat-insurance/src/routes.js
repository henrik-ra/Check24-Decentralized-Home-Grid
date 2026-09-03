/**
 * Speedboat-Insurance Routes
 */

const { TEMPLATE } = require('./template');
const { incClickCount, getClickCounts } = require('./tracking');
const { sendSignal, pushWidget } = require('./core-client');

function buildOfferDeeplink(offerId, productWebUrl, productId) {
	const id = String(offerId || '123').trim() || '123';
	if (productWebUrl) return `${productWebUrl}/offer/${id}`;
	return `check24://${productId}/offer/${id}`;
}

function registerRoutes(fastify, { coreUrl, ingestApiKey, productId, productWebUrl }) {
	// Simulate user interest in an offer
	fastify.post('/api/simulate/interest', async (request, reply) => {
		const { email, offerId, offerTitle, offerSubtitle } = request.body || {};
		if (!email) return reply.code(400).send({ error: 'email required' });

		const { offerId: id, offerTitle: title, offerSubtitle: subtitle, offerClicks, totalClicks } = incClickCount(
			email,
			offerId,
			offerTitle,
			offerSubtitle
		);

		fastify.log.info(
			{ email, productId, offerId: id, offerTitle: title, offerSubtitle: subtitle, offerClicks, totalClicks },
			'User showed interest'
		);

		// Send signal to Home-Core
		await sendSignal({
			userId: email,
			productId,
			weight: 1,
			offerId: id,
			offerTitle: title,
			offerSubtitle: subtitle,
			coreUrl,
			ingestApiKey,
			logger: fastify.log,
		});

		// Build widget and push to Home-Core
		const price = Math.floor(Math.random() * 200) + 20;
		const intensity = Number(offerClicks) || 1;
		const total = Number(totalClicks) || intensity;
		const offerLabel = String(id || '123');
		const offerDisplayTitle = typeof title === 'string' && title.trim() ? title.trim() : '';
		const offerDisplaySubtitle = typeof subtitle === 'string' && subtitle.trim() ? subtitle.trim() : '';
		const hintImageUrl = 'https://images.unsplash.com/photo-1454165804606-c3d57bc86b40?w=640&h=160&fit=crop';

		const components = [
			{
				type: 'HeroBanner',
				props: {
					title: `${offerDisplayTitle || TEMPLATE.title} für dich`,
					subtitle: offerDisplaySubtitle || TEMPLATE.subtitle,
					price: `${price} €`,
					imageUrl: 'https://images.unsplash.com/photo-1454165804606-c3d57bc86b40?w=800&h=450&fit=crop',
					cta: { label: TEMPLATE.cta, action: 'deeplink', deeplink: buildOfferDeeplink(id, productWebUrl, productId) },
				},
			},
			{
				type: 'TextCard',
				props: {
					label: 'Personalized hint',
					title: `Warum ${offerDisplayTitle || TEMPLATE.title}?`,
					text: `Du hast ${offerDisplayTitle ? `"${offerDisplayTitle}"` : `Angebot #${offerLabel}`} in ${productId.toUpperCase()} ${intensity}x angeklickt (gesamt ${total} Klicks).`,
					imageUrl: hintImageUrl,
				},
			},
		];

		await pushWidget({
			userId: email,
			productId,
			widgetId: `${productId}.primary.v1`,
			priority: TEMPLATE.priority,
			components,
			data: {
				price: `${price} €`,
				intensity,
				offerId: offerLabel,
				offerTitle: offerDisplayTitle || undefined,
				offerSubtitle: offerDisplaySubtitle || undefined,
				totalClicks: total,
			},
			coreUrl,
			ingestApiKey,
			logger: fastify.log,
		});

		return reply.send({
			status: 'interest_registered',
			email,
			productId,
			offerId: id,
			offerTitle: title,
			offerSubtitle: subtitle,
			offerClicks,
			totalClicks,
		});
	});

	// Health check with click tracking stats
	fastify.get('/health', async () => ({
		status: 'ok',
		productId,
		clickCounts: getClickCounts(productId),
	}));
}

module.exports = { registerRoutes };
