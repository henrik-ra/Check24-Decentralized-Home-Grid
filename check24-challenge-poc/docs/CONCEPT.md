# CONCEPT

This document describes the current Proof of Concept implementation for a personalized CHECK24 Home screen that aggregates many product widgets without amplifying traffic in the Home request path.

## Goals
- **No traffic amplification**: Home read-path must not call product backends.
- **Fast reads**: One API call from clients; Home Core reads from its own store.
- **Decentralized ownership**: Product teams (“speedboats”) own their widget content and push updates independently.
- **Graceful degradation**: Missing/invalid/expired widgets should not break the Home.

## High-level architecture

**Components**
- **Home Core**: API service providing
	- `POST /api/ingest` (write path for product teams)
	- `GET /api/home` (read path for clients)
- **Redis**: Snapshot store for widget payloads + per-user index + idempotency + rate limit counters.
- **Speedboats (product services)**: Push snapshots periodically or event-driven.
- **Clients**: Web (React) and Android (Compose) render the same SDUI payload.

**Key idea: push-based snapshots**
- Products push widget snapshots ahead of time.
- Home Core never calls products during `GET /api/home`.
- The Home response is computed from already-ingested snapshots.

## Data flow

### Write path (product → Home Core)
1. Product generates a widget snapshot for a user (or segment).
2. Product calls `POST /api/ingest` with headers `x-product-id` + `x-api-key`.
3. Home Core validates payload shape and enforces limits.
4. Home Core stores the snapshot in Redis with a hard TTL.
5. Home Core updates a per-user index set so the read path can resolve all widget keys efficiently.

### Read path (client → Home Core)
1. Client calls `GET /api/home` with header `x-user-id`.
2. Home Core reads the per-user index set from Redis (**tight timeout / fail-fast**).
3. Home Core uses a single `MGET` to load all snapshot payloads (**tight timeout / fail-fast**).
4. Missing/expired payloads are removed from the index.
5. Response is sorted by priority and returned.

**Read-path resilience (PoC)**
- `GET /api/home` is designed to be **always available**:
	- If Redis is unavailable, Home Core returns `200` with a degraded response.
	- Home Core keeps a small **in-memory Last Known Good (LKG)** response per user (best-effort, per instance) and serves it during short Redis outages.
	- If no LKG exists, Home Core returns a minimal empty response (`widgets: []`).

This keeps the Home endpoint up during dependency outages without ever calling product backends.

## Storage model (Redis)

This PoC uses simple key patterns:
- Widget snapshot key:
	- `widget:{userId}:{productId}:{widgetId}` → JSON payload
- Per-user index key:
	- `user:{userId}:widgets` → Redis Set containing snapshot keys for that user
- Idempotency key:
	- `idempo:{productId}:{idempotencyKey}` → `"1"` with TTL
- Rate limit counter:
	- `rl:{productId}:{windowStartEpochSeconds}` → counter (INCR) with TTL

This avoids `KEYS *` and keeps the read path bounded by the number of widgets actually referenced for the user.

## Widget payload & SDUI contract

Home Core stores an envelope with metadata plus SDUI components.

**Ingest request shape (PoC)**
```json
{
	"userId": "1",
	"widgetData": {
		"widgetId": "travel.hero.v1",
		"type": "hero_banner",
		"priority": 100,
		"schemaVersion": "1.0",
		"components": [
			{ "type": "HeroBanner", "props": { "title": "Mallorca Deal" } },
			{ "type": "TextCard", "props": { "title": "Why?", "text": "..." } }
		],
		"data": {}
	}
}
```

**SDUI principles in this PoC**
- `components[]` is a list of UI blocks.
- Each component has a `type` and a `props` object.
- Clients render only known component types; unknown types can be ignored (graceful degradation).

The concrete renderers live in:
- Web: `frontend-web/src/components/WidgetRenderer.tsx`
- Android: `frontend-mobile/android/app/src/main/java/.../MainActivity.kt`

## TTL semantics

This PoC encodes two times:
- **Hard TTL (enforced)**: Snapshot is stored in Redis with `WIDGET_HARD_TTL_SECONDS` and will be deleted automatically.
- **Soft TTL (informational)**: Envelope includes `softExpiresAt` (currently not enforced server-side; intended for future “staleness” UI rules).

Net effect:
- If a product stops pushing, its widgets naturally disappear after the hard TTL.

## Safety controls (PoC)

### Payload size limits
- Home Core enforces a maximum ingest payload size (default 64 KB) via Fastify `bodyLimit`.
- Additionally, if the request has a `Content-Length` header larger than the limit, it fails fast with `413`.

### Per-product rate limiting
- Ingest is rate-limited per `productId` using Redis counters (default 120/min).
- On limit exceed, Home Core responds with `429` and sets the `retry-after` header.

### Idempotency
- Products can send `idempotency-key` to make retries safe.
- Duplicates return `{ "status": "duplicate" }` without writing a new snapshot.

## Failure modes & behavior
- **Product down**: No impact to read path. Widgets slowly expire.
- **Redis down**:
	- `POST /api/ingest` returns `500 Storage Failure`
	- `GET /api/home` returns `200` and degrades gracefully:
		- Prefer in-memory LKG (`meta.degraded=true`, `meta.source=lkg`)
		- Otherwise empty widgets (`widgets: []`, `meta.degraded=true`, `meta.source=empty`)
- **Bad payload**: Ingest returns `400` (schema validation).
- **Expired/missing widget keys**: Removed from the per-user index automatically during reads.

## Scaling notes

This PoC is intentionally simple, but the pattern scales:
- Home Core is **stateless** (aside from Redis), so it can scale horizontally.
- Read path is efficient: `SMEMBERS` + `MGET` + in-memory sort.
- For production, consider:
	- Managed Redis (replication, persistence, backups)
	- Durable storage for long-lived personalization (e.g., database) + Redis as cache
	- Asynchronous ingest via a queue (for smoothing spikes)
	- Stronger authN/authZ (mTLS/OAuth, key rotation), auditing and per-tenant controls

## Configuration (Home Core)

Home Core reads configuration from environment variables:
- `REDIS_URL` (default: `redis://localhost:6379`)
- `INGEST_KEY_TRAVEL` (default: `dev-secret-123`)
- `MAX_INGEST_PAYLOAD_BYTES` (default: `65536`)
- `INGEST_RATE_LIMIT_PER_MINUTE` (default: `120`)
- `WIDGET_SOFT_TTL_SECONDS` (default: `60`)
- `WIDGET_HARD_TTL_SECONDS` (default: `3600`)
- `INDEX_TTL_SECONDS` (default: `604800`)
- `IDEMPOTENCY_TTL_SECONDS` (default: `300`)

Read-path resilience (PoC):
- `REDIS_READ_TIMEOUT_MS` (default: `40`) – per Redis read operation timeout budget
- `LKG_TTL_MS` (default: `300000`) – in-memory Last Known Good TTL
- `LKG_MAX_ENTRIES` (default: `5000`) – max LKG entries kept in memory

## Local run

The fastest path is Docker Compose:
- `docker compose -f infra/docker-compose.yml up --build`

This starts:
- Redis on `localhost:6379`
- Home Core on `localhost:3000`
- `speedboat-travel` pushing snapshots periodically

