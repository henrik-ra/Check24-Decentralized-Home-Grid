# DEVELOPER_GUIDELINE

This document describes how decentralized product teams ("speedboats") integrate with the Home platform using a **push-based snapshot** approach.

## Integration model
- Products never get called by the Home read-path.
- Products **push** user- or segment-specific widget snapshots to the Home Core ingest endpoint.
- Home clients (Web/Android/iOS) only call the Home Core read endpoint.

## Endpoints

### Write path: `POST /api/ingest`
Products push one widget snapshot per request.

**Required headers**
- `x-product-id`: product identifier (e.g. `travel`)
- `x-api-key`: product ingest key

**Optional headers**
- `idempotency-key`: unique key for retry-safe writes (recommended)

**Body (PoC schema)**
```json
{
	"userId": "1",
	"widgetData": {
		"widgetId": "travel.hero.v1",
		"type": "hero_banner",
		"priority": 100,
		"schemaVersion": "1.0",
		"components": [
			{ "type": "HeroBanner", "props": { "title": "Mallorca Deal", "price": "129 €" } }
		],
		"data": { "price": "129 €" }
	}
}
```

**Important rules**
- `productId` is taken from the header and stored with the snapshot.
- Payload size is capped (PoC default: 64 KB).
- Ingest is rate-limited per `productId` (PoC default: 120/min). On limit exceed: `429` + `retry-after` header.
- Snapshots expire (hard TTL); missing updates eventually disappear.

**Status codes (common)**
- `200` with `{ "status": "acknowledged" }` on success
- `200` with `{ "status": "duplicate" }` when `idempotency-key` was seen recently
- `400` invalid payload (schema validation)
- `403` invalid/missing product credentials (`x-product-id` / `x-api-key`)
- `413` payload too large
- `429` rate limit exceeded (check `retry-after` header)
- `500` Redis/storage failure

### Read path: `GET /api/home`
Clients request the full widget list for a user.

**Header (PoC)**
- `x-user-id`: user identifier (e.g. `1`)

**Response**
Returns `widgets[]` already sorted by priority.

**High availability behavior (PoC)**
- `GET /api/home` is designed to be **always available** and will return `200` even if Redis is unavailable.
- During Redis outages it may return a degraded response with an additional `meta` object:
	- `meta.degraded`: boolean
	- `meta.reason`: e.g. `redis_unavailable`
	- `meta.source`: `lkg` (last known good, in-memory) or `empty`

## Configuration

### Home Core environment variables
- `REDIS_URL` (default: `redis://localhost:6379`)
- `INGEST_KEYS_JSON` (default: `{ "travel": "dev-secret-123" }`)
- `MAX_INGEST_PAYLOAD_BYTES` (default: `65536`)
- `INGEST_RATE_LIMIT_PER_MINUTE` (default: `120`)
- `WIDGET_SOFT_TTL_SECONDS` (default: `60`)
- `WIDGET_HARD_TTL_SECONDS` (default: `3600`)
- `INDEX_TTL_SECONDS` (default: `604800`)
- `IDEMPOTENCY_TTL_SECONDS` (default: `300`)

Read-path resilience (PoC):
- `REDIS_READ_TIMEOUT_MS` (default: `40`)
- `LKG_TTL_MS` (default: `300000`)
- `LKG_MAX_ENTRIES` (default: `5000`)

### Speedboat environment variables (example service)
- `CORE_URL` (default: `http://localhost:3000`)
- `PRODUCT_ID` (default: `travel`)
- `INGEST_API_KEY` (default: `dev-secret-123`)
- `USER_IDS` (default: `1,2`)
- `WIDGET_ID` (default: `travel.hero.v1`)
- `PUSH_INTERVAL_MS` (default: `5000`)

## Local testing

### Option A: Docker Compose (recommended)
From the `check24-challenge-poc` folder:
- `docker compose -f infra/docker-compose.yml up --build`

### Option B: Run services manually (no Docker)
You need a Redis instance reachable at `REDIS_URL`.

Start Home Core:
- `cd services/home-core`
- `npm install`
- `$env:REDIS_URL = "redis://localhost:6379"`
- `$env:INGEST_KEYS_JSON = '{"travel":"dev-secret-123"}'`
- `npm start`

Start Speedboat:
- `cd services/speedboat-travel`
- `npm install`
- `$env:CORE_URL = "http://localhost:3000"`
- `$env:PRODUCT_ID = "travel"`
- `$env:INGEST_API_KEY = "dev-secret-123"`
- `npm start`

## Example requests

### PowerShell: Ingest a snapshot
```powershell
$payload = @{
	userId = "1"
	widgetData = @{
		widgetId = "travel.hero.v1"
		type = "hero_banner"
		priority = 100
		schemaVersion = "1.0"
		components = @(
			@{ type = "HeroBanner"; props = @{ title = "Mallorca Deal"; price = "129 €" } }
		)
		data = @{ price = "129 €" }
	}
}

Invoke-RestMethod -Method Post `
	-Uri "http://localhost:3000/api/ingest" `
	-ContentType "application/json" `
	-Headers @{ "x-product-id" = "travel"; "x-api-key" = "dev-secret-123"; "idempotency-key" = (New-Guid).Guid } `
	-Body ($payload | ConvertTo-Json -Depth 10)
```

### PowerShell: Trigger payload limit (expect 413)
```powershell
$big = "a" * 70000
$payload = @{
	userId = "1"
	widgetData = @{
		widgetId = "too-big"
		type = "hero_banner"
		priority = 1
		components = @(
			@{ type = "TextCard"; props = @{ title = "Big"; text = $big } }
		)
	}
}

Invoke-RestMethod -Method Post `
	-Uri "http://localhost:3000/api/ingest" `
	-ContentType "application/json" `
	-Headers @{ "x-product-id" = "travel"; "x-api-key" = "dev-secret-123"; "idempotency-key" = (New-Guid).Guid } `
	-Body ($payload | ConvertTo-Json -Depth 10)
```

### PowerShell: Read Home widgets
```powershell
Invoke-RestMethod `
	-Uri "http://localhost:3000/api/home" `
	-Headers @{ "x-user-id" = "1" }
```

## Troubleshooting

- If ingest hits `429` quickly while testing manually: the demo speedboat is also writing ingests. Stop it temporarily with `docker stop infra-speedboat-travel-1`.
- If Android cannot reach localhost: use emulator host mapping `http://10.0.2.2:3000/` (debug build allows cleartext HTTP).
