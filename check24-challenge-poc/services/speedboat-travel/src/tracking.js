/**
 * Click Tracking Logic for Travel
 */

// Map<email, { totalCount: number, lastOfferId: string, lastOfferTitle?: string, lastOfferSubtitle?: string, offerCounts: Map<string, number>, offerTitles?: Map<string, string>, offerSubtitles?: Map<string, string> }>
const clickCounts = new Map();

function incClickCount(email, offerId, offerTitle, offerSubtitle) {
	const id = String(offerId || '123').trim() || '123';
	const state = clickCounts.get(email) || { totalCount: 0, lastOfferId: id, offerCounts: new Map() };

	state.totalCount = (state.totalCount || 0) + 1;
	state.lastOfferId = id;

	if (typeof offerTitle === 'string' && offerTitle.trim()) {
		if (!state.offerTitles) state.offerTitles = new Map();
		state.offerTitles.set(id, offerTitle.trim());
		state.lastOfferTitle = offerTitle.trim();
	}

	if (typeof offerSubtitle === 'string' && offerSubtitle.trim()) {
		if (!state.offerSubtitles) state.offerSubtitles = new Map();
		state.offerSubtitles.set(id, offerSubtitle.trim());
		state.lastOfferSubtitle = offerSubtitle.trim();
	}

	if (!state.offerCounts) state.offerCounts = new Map();
	const nextOffer = (state.offerCounts.get(id) || 0) + 1;
	state.offerCounts.set(id, nextOffer);

	clickCounts.set(email, state);

	const titleFromMap = state.offerTitles ? state.offerTitles.get(id) : undefined;
	const subtitleFromMap = state.offerSubtitles ? state.offerSubtitles.get(id) : undefined;
	const resolvedOfferTitle = typeof offerTitle === 'string' && offerTitle.trim() ? offerTitle.trim() : titleFromMap;
	const resolvedOfferSubtitle =
		typeof offerSubtitle === 'string' && offerSubtitle.trim() ? offerSubtitle.trim() : subtitleFromMap;

	return {
		offerId: id,
		offerTitle: resolvedOfferTitle,
		offerSubtitle: resolvedOfferSubtitle,
		offerClicks: nextOffer,
		totalClicks: state.totalCount,
	};
}

function getClickCounts(productId) {
	return Array.from(clickCounts.entries()).map(([email, state]) => ({
		email,
		totalClicks: state.totalCount || 0,
		lastOfferId: state.lastOfferId,
		lastOfferTitle: state.lastOfferTitle,
		lastOfferSubtitle: state.lastOfferSubtitle,
		offers: Object.fromEntries(Array.from((state.offerCounts || new Map()).entries())),
	}));
}

module.exports = { incClickCount, getClickCounts };
