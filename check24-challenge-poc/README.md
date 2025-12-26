# check24-challenge-poc

PoC implementation for the CHECK24 GenDev Technical Concept Challenge.

This repository demonstrates a **push-based snapshot** Home Widgets platform:
- Product teams (“speedboats”) push user-specific widget snapshots.
- The Home read-path (`GET /api/home`) reads only from Home-controlled storage (Redis) and degrades gracefully on outages.
- Web and Android clients render the same SDUI component payload.

## Repository structure
- `services/home-core`: Home Core API (Fastify + Redis)
- `services/speedboat-travel`: Example speedboat that pushes snapshots
- `frontend-web`: Web client (React + Vite + TypeScript)
- `frontend-mobile/android`: Android client (Kotlin + Jetpack Compose)
- `infra/docker-compose.yml`: Local dev stack (Redis + services)
- `docs`: Architecture and integration docs

## Quickstart (recommended)

### 1) Start backend + redis + demo speedboat
From this folder (`check24-challenge-poc`):

```powershell
docker compose -f infra/docker-compose.yml up --build
```

Endpoints:
- Health: `GET http://localhost:3000/health`
- Home: `GET http://localhost:3000/api/home` (requires header `x-user-id`)
- Ingest: `POST http://localhost:3000/api/ingest` (requires `x-product-id` + `x-api-key`)

### 1b) (Demo) Redis outage should not break Home
This showcases **High Availability by Design**: Home stays available even if Redis is down.

```powershell
# 1) Warm up: get a normal response
Invoke-RestMethod -Uri "http://localhost:3000/api/home" -Headers @{ "x-user-id" = "1" } | ConvertTo-Json -Depth 6

# 2) Simulate outage
docker compose -f infra/docker-compose.yml stop redis

# 3) Home still returns 200, but includes meta.degraded
Invoke-RestMethod -Uri "http://localhost:3000/api/home" -Headers @{ "x-user-id" = "1" } | ConvertTo-Json -Depth 6

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

## Azure deploy (IaC)

This repo includes a repeatable Azure deployment for:
- Azure Container Apps (Home Core + demo speedboat)
- Azure Cache for Redis
- Azure Container Registry (builds run via `az acr build`; no local Docker required)
- Azure Storage static website hosting (web frontend)

Prerequisites:
- Azure CLI installed and logged in (`az login`)
- Node.js + npm installed (to build the web frontend)

Deploy:
```powershell
cd infra/azure

# Clean setup: one ingest key per product.
./deploy.ps1 -ResourceGroupName rg-check24-home-core -Location westeurope -NamePrefix c24 -ImageTag latest -IngestKeyTravel "dev-secret-123"

# Optional: override the demo speedboat key (defaults to -IngestKeyTravel)
# ./deploy.ps1 ... -IngestKeyTravel "dev-secret-123" -SpeedboatIngestApiKey "dev-secret-123"
```

After deploy, the script prints:
- Public backend URL (Container App)
- Public frontend URL (Azure Storage static website)

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
- `MAX_INGEST_PAYLOAD_BYTES` (`65536`)
- `INGEST_RATE_LIMIT_PER_MINUTE` (`120`)
- `WIDGET_SOFT_TTL_SECONDS` (`60`)
- `WIDGET_HARD_TTL_SECONDS` (`3600`)
- `INDEX_TTL_SECONDS` (`604800`)
- `IDEMPOTENCY_TTL_SECONDS` (`300`)
- `REDIS_READ_TIMEOUT_MS` (`40`)
- `LKG_TTL_MS` (`300000`)
- `LKG_MAX_ENTRIES` (`5000`)

## Documentation

- Architecture and design: [docs/CONCEPT.md](docs/CONCEPT.md)
- Integration guide for speedboats: [docs/DEVELOPER_GUIDELINE.md](docs/DEVELOPER_GUIDELINE.md)
