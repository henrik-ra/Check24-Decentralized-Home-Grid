/**
 * Validation and normalization utilities
 */

function assertFinitePositiveInt(value, fallback) {
	return Number.isFinite(value) && value > 0 ? value : fallback;
}

function normalizeWelcomeText(value) {
	const text = String(value || '')
		.replace(/\s+/g, ' ')
		.replace(/^\s+|\s+$/g, '')
		.replace(/^["'`]+|["'`]+$/g, '');
	if (!text) return '';
	return text.length > 160 ? `${text.slice(0, 157)}...` : text;
}

function normalizeUrl(value) {
	const v = String(value || '').trim();
	if (!v) return '';
	return v.endsWith('/') ? v.slice(0, -1) : v;
}

module.exports = {
	assertFinitePositiveInt,
	normalizeWelcomeText,
	normalizeUrl,
};
