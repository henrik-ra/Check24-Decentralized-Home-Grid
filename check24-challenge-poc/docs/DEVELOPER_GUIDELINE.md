# DEVELOPER_GUIDELINE

This document describes how decentralized product teams ("speedboats") integrate with the Home platform using a **push-based snapshot** approach.

## Integration model
- Products never get called by the Home read-path.
- Products **push** user- or segment-specific widget snapshots to the Home Core ingest endpoint.
- Home clients (Web/Android/iOS) only call the Home Core read endpoint.

Additionally, product webapps can use a PoC cross-origin SSO flow (handoff/exchange) to obtain a JWT without re-entering email.

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

**Required: JWT**
- `Authorization: Bearer <token>`

The Home Core uses the JWT `sub` claim as the user id.

**Response**
Returns `widgets[]` already sorted by priority.

**High availability behavior (PoC)**
- `GET /api/home` is designed to be **always available** and will return `200` even if Redis is unavailable.
- During Redis outages it may return a degraded response with an additional `meta` object:
	- `meta.degraded`: boolean
	- `meta.reason`: e.g. `redis_unavailable`
	- `meta.source`: `lkg` (last known good, in-memory) or `empty`

### Cross-origin SSO (PoC)

This PoC includes a simple, short-lived one-time code flow stored in Redis.

- `POST /api/auth/handoff`
	- Called by **Home Web**.
	- Requires `Authorization: Bearer <JWT>`.
	- Returns `{ code, expiresInSeconds }`.

- `POST /api/auth/exchange`
	- Called by **product webapps**.
	- Body: `{ "code": "..." }`
	- Returns `{ token, user }` where `user.email` is the JWT subject.

Troubleshooting note:
- If Redis does not support `GETDEL`, exchange falls back to `GET` + `DEL` (best-effort).

## Configuration

### Home Core environment variables
- `REDIS_URL` (default: `redis://localhost:6379`)
- `INGEST_KEY_TRAVEL` (default: `dev-secret-123`)
 - `INGEST_KEY_DSL` (default: `dev-secret-123`)
 - `INGEST_KEY_INSURANCE` (default: `dev-secret-123`)

Optional auth (MongoDB + JWT):
- `MONGODB_URI` (unset -> `/api/auth/*` disabled)
- `MONGODB_DB` (default: `check24-home`)
- `JWT_SECRET` (required)
- `JWT_EXPIRES_IN` (default: `7d`)

Ingest auth keys follow the pattern `INGEST_KEY_<PRODUCT_ID_UPPER_SNAKE>`.
Example: `x-product-id: travel` -> `INGEST_KEY_TRAVEL`.
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
- `CORE_URL` (default: `http://localhost:3000`) – Home Core base URL
- `PRODUCT_ID` (default varies per service) – used as `x-product-id`
- `INGEST_API_KEY` (default: `dev-secret-123`) – must match `INGEST_KEY_<PRODUCT>` on Home Core
- `PRODUCT_WEB_URL` (optional) – used to create web deeplinks like `${PRODUCT_WEB_URL}/offer/<id>`
- `PUSH_INTERVAL_MS` (default: `5000`) – demo periodic push interval

### Product webapps environment variables (Vite)
- `VITE_SPEEDBOAT_URL` – speedboat base URL
- `VITE_HOME_URL` – Home Web URL (for navigation)
- `VITE_CORE_URL` – Home Core base URL (used for `POST /api/auth/exchange`)

## Local testing

### Option A: Docker Compose (recommended)
From the `check24-challenge-poc` folder:
- `docker compose -f infra/docker-compose.yml up --build`

Then:
- Start Home Web (`frontend-web`) and any product web (`frontend-products/*`).
- Navigate from Home to product pages using the SSO handoff flow.

### Option B: Run services manually (no Docker)
You need a Redis instance reachable at `REDIS_URL`.

Start Home Core:
- `cd services/home-core`
- `npm install`
- `$env:REDIS_URL = "redis://localhost:6379"`
- `$env:INGEST_KEY_TRAVEL = "dev-secret-123"`
- `npm start`

Start Speedboat:
- `cd services/speedboat-travel`
- `npm install`
- `$env:CORE_URL = "http://localhost:3000"`
- `$env:PRODUCT_ID = "travel"`
- `$env:INGEST_API_KEY = "dev-secret-123"`
- `npm start`

## Example requests

### PowerShell: Register + use JWT for /api/home
```powershell
# Requires MONGODB_URI + JWT_SECRET to be set on the home-core

$register = Invoke-RestMethod -Method Post `
	-Uri "http://localhost:3000/api/auth/register" `
	-ContentType "application/json" `
	-Body (@{ email = "user@example.com"; password = "secret123" } | ConvertTo-Json)

$token = $register.token

Invoke-RestMethod `
	-Uri "http://localhost:3000/api/home" `
	-Headers @{ Authorization = "Bearer $token" }
```

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
# Requires MONGODB_URI + JWT_SECRET to be set on the home-core

$register = Invoke-RestMethod -Method Post `
	-Uri "http://localhost:3000/api/auth/register" `
	-ContentType "application/json" `
	-Body (@{ email = "demo@example.com"; password = "test1234" } | ConvertTo-Json)

$token = $register.token

Invoke-RestMethod `
	-Uri "http://localhost:3000/api/home" `
	-Headers @{ Authorization = "Bearer $token" }
```

## Troubleshooting

- If ingest hits `429` quickly while testing manually: the demo speedboat is also writing ingests. Stop it temporarily with `docker stop infra-speedboat-travel-1`.
- If Android cannot reach localhost: use emulator host mapping `http://10.0.2.2:3000/` (debug build allows cleartext HTTP).

### Common SSO issue on product pages: `SSO exchange failed: 503 - {"error":"Auth unavailable"}`
This means the product webapp successfully loaded, but Home Core could not complete the exchange.
Typical causes:
- Home Core cannot reach Redis (handoff codes are stored in Redis)
- Redis command support mismatch (e.g. `GETDEL`), mitigated in this repo by a `GET` + `DEL` fallback

Validate:
- Home Core health: `GET /health`
- Redis connectivity from Home Core logs

### Mock images not loading
If external placeholder image hosts are blocked (DNS/adblock/proxy), switch to inline `data:image/svg+xml` URLs.
This repo uses inline SVG data URLs for mock images to avoid external dependencies.
