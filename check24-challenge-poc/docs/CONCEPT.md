# CONCEPT

This document describes the current Proof of Concept implementation for a personalized CHECK24 Home screen that aggregates many product widgets without amplifying traffic in the Home request path.

## Goals
- **No traffic amplification**: Home read-path must not call product backends.
- **Fast reads**: One API call from clients; Home Core reads from its own store.
- **Decentralized ownership**: Product teams (“speedboats”) own their widget content and push updates independently.
- **Graceful degradation**: Missing/invalid/expired widgets should not break the Home.
- **Non-empty Home**: Always show at least 3 widgets using a Home-owned baseline (no product fanout).
- **Sophisticated Personalization**: Dynamic re-ranking based on user affinity signals.
- **Adaptive Layouts**: Products control presentation based on user context.

## High-level architecture

**Components**
- **Home Core**: API service providing
	- `POST /api/ingest` (write path for product teams)
	- `POST /api/signals` (affinity signal ingestion)
	- `GET /api/home` (read path for clients)
- **Redis**: Snapshot store for widget payloads + per-user index + affinity scores.
- **Speedboats (product services)**: Push snapshots and affinity signals periodically or event-driven.
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

### Signal path (product → Home Core)
1. Product detects user interest (e.g., clicks, searches).
2. Product calls `POST /api/signals` with `{ userId, signal: 'interest', weight: 5.0 }`.
3. Home Core updates the user's affinity score for that product in Redis (`affinity:{userId}`).

### Read path (client → Home Core)
1. Client calls `GET /api/home`.
2. Home Core reads the per-user index set from Redis.
3. Home Core fetches user affinity scores from Redis.
4. Home Core uses a single `MGET` to load all snapshot payloads.
5. **Dynamic Re-ranking**: 
   - `FinalPriority = WidgetPriority + (AffinityScore * 20)`
   - Widgets with high affinity scores bubble to the top.
   - Top widgets get a `meta.isPersonalized = true` flag.
6. **Baseline Fill (Always ≥ 3 widgets)**:
	- If the personalized list has fewer than 3 widgets, Home Core appends Home-owned baseline widgets (`CompactRow`).
	- Baseline widgets have low priority and never outrank personalized content.
7. Response is sorted by final priority and returned.

**Why baseline is handled in Home Core (clean architecture)**
- We avoid “push to all users” fanout (write amplification).
- Baseline is stable, tech-agnostic and safe for Web + Native.
- Products stay autonomous: they only push when they have signal/knowledge.

## Adaptive Layouts (Flexibility)

Products have full autonomy over how their content is presented. The Home Core is agnostic to the UI components.

**Example: Speedboat Travel**
- **Low Interest (1-2 clicks)**: Sends a `CompactRow` widget (low intrusion).
- **High Interest (>2 clicks)**: Sends a `HeroBanner` widget (high impact).

This logic resides entirely within the product service. The Home Core simply stores and serves the JSON payload.

## Storage model (Redis)

This PoC uses simple key patterns:
- Widget snapshot key: `widget:{userId}:{productId}:{widgetId}` → JSON payload
- Per-user index key: `user:{userId}:widgets` → Redis Set containing snapshot keys
- Affinity score key: `affinity:{userId}` → Hash `{ productId: score }`
- Idempotency key: `idempo:{productId}:{idempotencyKey}` → `"1"` with TTL

## Widget payload & SDUI contract

Home Core stores an envelope with metadata plus SDUI components.

**Ingest request shape (PoC)**
```json
{
	"userId": "1",
	"widgetData": {
		"widgetId": "travel.hero.v1",
		"type": "hero_banner", // or "compact_row"
		"priority": 100,
		"components": [
			{ "type": "HeroBanner", "props": { "title": "Mallorca Deal" } }
            // OR
            { "type": "CompactRow", "props": { "title": "Mallorca Deal" } }
		],
		"data": {}
	}
}
```

**SDUI principles in this PoC**
- `components[]` is a list of UI blocks.
- Clients render only known component types (`HeroBanner`, `TextCard`, `CompactRow`).
- Unknown types are ignored (graceful degradation).

The concrete renderers live in:
- Web: `frontend-web/src/components/WidgetRenderer.tsx`
- Android: `frontend-mobile/android/app/src/main/java/.../MainActivity.kt`

