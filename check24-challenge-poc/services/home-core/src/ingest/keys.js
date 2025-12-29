/**
 * Product ingest key management
 */

function normalizeProductIdToEnvSuffix(productId) {
	return String(productId)
		.toUpperCase()
		.replace(/[^A-Z0-9]+/g, '_')
		.replace(/^_+|_+$/g, '');
}

const DEFAULT_INGEST_KEYS_BY_SUFFIX = {
	TRAVEL: 'dev-secret-123',
	DSL: 'dev-secret-123',
	INSURANCE: 'dev-secret-123',
};

function getIngestKeyForProduct(productId) {
	const suffix = normalizeProductIdToEnvSuffix(productId);
	if (!suffix) return undefined;

	const envKey = process.env[`INGEST_KEY_${suffix}`];
	const defaultKey = DEFAULT_INGEST_KEYS_BY_SUFFIX[suffix];

	if (!envKey && !defaultKey) {
		console.warn(`No ingest key found for product ${productId} (suffix: ${suffix})`);
	}

	return envKey || defaultKey;
}

module.exports = {
	normalizeProductIdToEnvSuffix,
	getIngestKeyForProduct,
};
