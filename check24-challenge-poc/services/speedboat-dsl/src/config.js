/**
 * Speedboat-DSL Configuration
 */

module.exports = {
	productId: String(process.env.PRODUCT_ID || 'dsl').trim().toLowerCase(),
	productWebUrl: String(process.env.PRODUCT_WEB_URL || '').trim().replace(/\/$/, ''),
	coreUrl: (process.env.CORE_URL || 'http://localhost:3000').replace(/\/$/, ''), // delete final slash
	ingestApiKey: process.env.INGEST_API_KEY || 'dev-secret-123',
	port: Number.parseInt(process.env.PORT || '3000', 10), // decimal base
	host: process.env.HOST || '0.0.0.0',
};


/* Azure Deployment:
	# azure-deploy.yml oder Portal-Konfiguration
	env:
	PORT: 3003
	PRODUCT_ID: insurance
*/


/* Local Deployment:
	# Windows (PowerShell)
	$env:PORT=3003
	npm start

	# Windows (CMD)
	set PORT=3003
	npm start

	# Linux/Mac
	PORT=3003 npm start
*/

/* Docker:
	# Dockerfile
	ENV PORT=3003
*/

// Fallback-Wert '3000'
