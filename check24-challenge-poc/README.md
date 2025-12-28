# check24-challenge-poc

PoC implementation for the CHECK24 GenDev Technical Concept Challenge.

This repository demonstrates a **push-based snapshot** Home Widgets platform:
- Product teams (“speedboats”) push user-specific widget snapshots.
- The Home read-path (`GET /api/home`) reads only from Home-controlled storage (Redis) and degrades gracefully on outages.
- Web and Android clients render the same SDUI component payload.

## Repository structure
- `services/home-core`: Home Core API (Fastify + Redis)
- `services/speedboat-travel`: Travel speedboat that pushes snapshots
- `services/speedboat-dsl`: DSL speedboat that pushes snapshots
- `services/speedboat-insurance`: Insurance speedboat that pushes snapshots
- `frontend-web`: Home web client (React + Vite + TypeScript)
- `frontend-products/*`: Product web clients (separate deployments)
- `frontend-mobile/android`: Android client (Kotlin + Jetpack Compose)
- `infra/docker-compose.yml`: Local dev stack (Redis + services)
- `docs`: Architecture and integration docs

## Quickstart (recommended)

### 1) Start backend + redis + demo speedboat
From this folder (`check24-challenge-poc`):

```powershell
docker compose -f infra/docker-compose.yml up --build
```

Local URLs:
- Home Core: `http://localhost:3000`
- Speedboat Travel: `http://localhost:3001`
- Speedboat DSL: `http://localhost:3002`
- Speedboat Insurance: `http://localhost:3003`

Endpoints:
- Health: `GET http://localhost:3000/health`
- Home: `GET http://localhost:3000/api/home` (requires `Authorization: Bearer <JWT>`)
- Ingest: `POST http://localhost:3000/api/ingest` (requires `x-product-id` + `x-api-key`)

### 1b) (Demo) Redis outage should not break Home
This showcases **High Availability by Design**: Home stays available even if Redis is down.

```powershell
# 0) Create a user and get a JWT
$register = Invoke-RestMethod -Method Post -Uri "http://localhost:3000/api/auth/register" -ContentType "application/json" -Body (@{ email = "demo@example.com"; password = "test1234" } | ConvertTo-Json)
$token = $register.token

# 1) Warm up: get a normal response
Invoke-RestMethod -Uri "http://localhost:3000/api/home" -Headers @{ Authorization = "Bearer $token" } | ConvertTo-Json -Depth 6

# 2) Simulate outage
docker compose -f infra/docker-compose.yml stop redis

# 3) Home still returns 200, but includes meta.degraded
Invoke-RestMethod -Uri "http://localhost:3000/api/home" -Headers @{ Authorization = "Bearer $token" } | ConvertTo-Json -Depth 6

# 4) Recover
docker compose -f infra/docker-compose.yml up -d redis
```

### 2) Start the web client
```powershell
cd frontend-web
npm install
npm run dev
```

Web defaults to `http://localhost:3000` as API base.
To point it elsewhere:
- `VITE_API_BASE_URL=http://localhost:3000`
- `VITE_TRAVEL_WEB_URL=http://localhost:5174`
- `VITE_DSL_WEB_URL=http://localhost:5175`
- `VITE_INSURANCE_WEB_URL=http://localhost:5176`

### 3) Start a product site (separate webapp)
Each product site runs independently (like separate subdomains in production):

```powershell
cd frontend-products/travel-web
$env:VITE_SPEEDBOAT_URL = "http://localhost:3001"
$env:VITE_HOME_URL = "http://localhost:5173"
npm install
npm run dev
```

## Azure deploy (IaC)

This repo includes a repeatable Azure deployment for:
- Azure Container Apps (Home Core + 3 speedboats)
- Azure Cache for Redis
- Azure Container Registry (builds run via `az acr build`; no local Docker required)
- Azure Storage static website hosting (Home + 3 product frontends)

Prerequisites:
- Azure CLI installed and logged in (`az login`)
- Node.js + npm installed (to build the web frontend)

Deploy:
```powershell
cd infra/azure

# Clean setup: one ingest key per product.

# Prefer env vars for secrets to avoid leaking them in shell history.
$env:MONGODB_URI = "<your-atlas-uri>"
$env:JWT_SECRET = "<strong-secret>"

./deploy.ps1 -ResourceGroupName rg-check24-home-core -Location westeurope -NamePrefix c24 -ImageTag latest `
	-IngestKeyTravel "dev-secret-123" -IngestKeyDsl "dev-secret-123" -IngestKeyInsurance "dev-secret-123" `
	-DemoUserId "demo@example.com"

# Optional: override the demo speedboat key (defaults to -IngestKeyTravel)
# ./deploy.ps1 ... -IngestKeyTravel "dev-secret-123" -SpeedboatIngestApiKey "dev-secret-123"
```

After deploy, the script prints:
- Public backend URL (Container App)
- Public Home URL (Azure Storage static website)
- Public product URLs (Travel/DSL/Insurance)

Run the web client locally against the Azure API:
```powershell
cd frontend-web
$env:VITE_API_BASE_URL = "https://<your-containerapp-fqdn>"
npm install
npm run dev
```

## Android client

Open the Android project in Android Studio:
- `frontend-mobile/android`

Networking:
- Emulator reaches the host machine via `http://10.0.2.2:3000/`
- Cleartext HTTP is enabled only for the `debug` build type (release assumes HTTPS)

## Configuration

### Home Core (service)
Environment variables (defaults in parentheses):
- `REDIS_URL` (`redis://localhost:6379`)
- `INGEST_KEY_TRAVEL` (`dev-secret-123`)
- `INGEST_KEY_DSL` (`dev-secret-123`)
- `INGEST_KEY_INSURANCE` (`dev-secret-123`)
- `TRAVEL_WEB_URL` (unset -> baseline falls back to `check24://...`)
- `DSL_WEB_URL` (unset -> baseline falls back to `check24://...`)
- `INSURANCE_WEB_URL` (unset -> baseline falls back to `check24://...`)
- `MONGODB_URI` (unset -> `/api/auth/*` disabled; `/api/home` still requires a JWT issued elsewhere)
- `JWT_SECRET` (**required**)
- `JWT_EXPIRES_IN` (`7d`)
- `MAX_INGEST_PAYLOAD_BYTES` (`65536`)
- `INGEST_RATE_LIMIT_PER_MINUTE` (`120`)
- `WIDGET_SOFT_TTL_SECONDS` (`60`)
- `WIDGET_HARD_TTL_SECONDS` (`3600`)
- `INDEX_TTL_SECONDS` (`604800`)
- `IDEMPOTENCY_TTL_SECONDS` (`300`)
- `REDIS_READ_TIMEOUT_MS` (`40`)
- `LKG_TTL_MS` (`300000`)
- `LKG_MAX_ENTRIES` (`5000`)

## Minimal Auth (MongoDB + JWT)

Home Core exposes:
- `POST /api/auth/register` -> `{ token, user }`
- `POST /api/auth/login` -> `{ token, user }`

`GET /api/home` requires:
- `Authorization: Bearer <token>`

Demo note: the bundled `speedboat-travel` writes widgets for `DemoUserId`.

## Documentation

- Architecture and design: [docs/CONCEPT.md](docs/CONCEPT.md)
- Integration guide for speedboats: [docs/DEVELOPER_GUIDELINE.md](docs/DEVELOPER_GUIDELINE.md)
