/**
 * Baseline widget generation and widget list management
 */

const config = require('../config');
const { nowIso, addSecondsToIso } = require('../utils/time');
const { assertFinitePositiveInt, normalizeUrl } = require('../utils/validation');

function buildBaselineWidgets() {
	const productId = 'BASELINE';
	const generatedAt = nowIso();
	const softExpiresAt = addSecondsToIso(generatedAt, assertFinitePositiveInt(config.ingest.widgetSoftTtlSeconds, 60));
	const hardExpiresAt = addSecondsToIso(generatedAt, assertFinitePositiveInt(config.ingest.widgetHardTtlSeconds, 3600));

	const withOfferPath = (baseUrl, fallbackDeeplink) => {
		const base = normalizeUrl(baseUrl);
		return base ? `${base}/offer/123` : fallbackDeeplink;
	};

	const travelOfferUrl = withOfferPath(config.products.travelWebUrl, 'check24://travel/offer/123');
	const dslOfferUrl = withOfferPath(config.products.dslWebUrl, 'check24://dsl/offer/123');
	const insuranceOfferUrl = withOfferPath(config.products.insuranceWebUrl, 'check24://insurance/offer/123');

	const travelIcon = 'https://images.unsplash.com/photo-1488646953014-85cb44e25828?w=80&h=80&fit=crop';
	const dslIcon = 'https://images.unsplash.com/photo-1451187580459-43490279c0fa?w=80&h=80&fit=crop';
	const insuranceIcon = 'https://images.unsplash.com/photo-1454165804606-c3d57bc86b40?w=80&h=80&fit=crop';

	return [
		{
			schemaVersion: '1.0',
			widgetId: 'baseline.travel.v1',
			productId,
			type: 'compact_row',
			priority: 30,
			components: [
				{
					type: 'CompactRow',
					props: {
						title: 'Urlaub finden',
						subtitle: 'Top Pauschalreisen entdecken',
						imageUrl: travelIcon,
						price: 'Top Deals',
						cta: { label: 'Ansehen', action: 'deeplink', deeplink: travelOfferUrl },
					},
				},
			],
			data: { baseline: true },
			softExpiresAt,
			hardExpiresAt,
			generatedAt,
			meta: { isBaseline: true },
		},
		{
			schemaVersion: '1.0',
			widgetId: 'baseline.dsl.v1',
			productId,
			type: 'compact_row',
			priority: 20,
			components: [
				{
					type: 'CompactRow',
					props: {
						title: 'Internet vergleichen',
						subtitle: 'Tarife für Zuhause prüfen',
						imageUrl: dslIcon,
						price: 'Schnell & günstig',
						cta: { label: 'Vergleichen', action: 'deeplink', deeplink: dslOfferUrl },
					},
				},
			],
			data: { baseline: true },
			softExpiresAt,
			hardExpiresAt,
			generatedAt,
			meta: { isBaseline: true },
		},
		{
			schemaVersion: '1.0',
			widgetId: 'baseline.insurance.v1',
			productId,
			type: 'compact_row',
			priority: 10,
			components: [
				{
					type: 'CompactRow',
					props: {
						title: 'Versicherung prüfen',
						subtitle: 'Potenzial sparen entdecken',
						imageUrl: insuranceIcon,
						price: 'Sparpotenzial',
						cta: { label: 'Berechnen', action: 'deeplink', deeplink: insuranceOfferUrl },
					},
				},
			],
			data: { baseline: true },
			softExpiresAt,
			hardExpiresAt,
			generatedAt,
			meta: { isBaseline: true },
		},
	];
}

function ensureMinWidgets(widgets, minCount) {
	const safeWidgets = Array.isArray(widgets) ? [...widgets] : [];
	const min = assertFinitePositiveInt(Number(minCount), 3);
	if (safeWidgets.length >= min) return safeWidgets;

	const existingIds = new Set(safeWidgets.map((w) => `${w.productId}:${w.widgetId}`));
	for (const candidate of buildBaselineWidgets()) {
		const id = `${candidate.productId}:${candidate.widgetId}`;
		if (existingIds.has(id)) continue;
		safeWidgets.push(candidate);
		existingIds.add(id);
		if (safeWidgets.length >= min) break;
	}

	return safeWidgets;
}

module.exports = {
	buildBaselineWidgets,
	ensureMinWidgets,
};
