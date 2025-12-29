/**
 * Speedboat-Travel Configuration
 */

module.exports = {
	productId: String(process.env.PRODUCT_ID || 'travel').trim().toLowerCase(),
	productWebUrl: String(process.env.PRODUCT_WEB_URL || '').trim().replace(/\/$/, ''),
	coreUrl: (process.env.CORE_URL || 'http://localhost:3000').replace(/\/$/, ''),
	ingestApiKey: process.env.INGEST_API_KEY || 'dev-secret-123',
	port: Number.parseInt(process.env.PORT || '3000', 10),
	host: process.env.HOST || '0.0.0.0',
};
