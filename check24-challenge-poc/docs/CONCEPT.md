# Technical Concept: Decentralized Home Widgets

This document outlines the architecture for the next-generation CHECK24 Home.
**Goal:** Enable decentralized product teams ("Speedboats") to push personalized content to the central Home screen without coupling, latency spikes, or availability risks.

## 1. Architecture: Push-Based & Decentralized

We invert the traditional dependency model. Instead of the Home App fetching data from 60+ products (Pull), products calculate offers asynchronously and **push** UI snapshots to the Home Core.

### High-Level Diagram
`mermaid
flowchart LR
    User((User)) -->|1. Interaction| Speedboat[Product Service]
    Speedboat -->|2. Push Snapshot| HomeCore[Home Core API]
    HomeCore -->|3. Store| Redis[(Redis Cache)]
    
    Client[Web / Android App] -->|4. Fetch Feed| HomeCore
    HomeCore -->|5. Read (O(1))| Redis
`

### Core Components
1.  **Home Core (Orchestrator):**
    *   **Tech:** Node.js (Fastify), Stateless.
    *   **Role:** Validates ingest requests, manages Redis storage, serves the Home Feed.
    *   **Resilience:** Implements "Last Known Good" (LKG) in-memory caching.
2.  **Speedboats (Product Services):**
    *   **Tech:** Independent stacks (Node.js in PoC).
    *   **Role:** Own the business logic. Calculate "Best Offer" or "Status Update" and push JSON snapshots.
3.  **Storage Layer:**
    *   **Redis (Hot):** Stores active widget snapshots (widget:{userId}:{productId}).
    *   **MongoDB (Cold/Auth):** Stores user identity and auth data (PoC only).
4.  **Clients (SDUI Renderers):**
    *   **Web:** React + Vite.
    *   **Android:** Kotlin + Jetpack Compose.
    *   **Role:** Dumb rendering engines. They map JSON 	ype: "HeroBanner" to native UI components.

---

## 2. Data Strategy

### The "Push" Model (Write Path)
*   **Endpoint:** POST /api/ingest
*   **Trigger:** User interaction (e.g., "User viewed DSL comparison") or state change (e.g., "Contract approved").
*   **Payload:** Fully formed SDUI JSON.
*   **Optimization:**
    *   **Idempotency:** Prevents duplicate processing.
    *   **Rate Limiting:** 120 req/min per product to protect the Core.
    *   **TTL:** Widgets expire automatically (default 1h) to ensure freshness.

### The "Pull" Model (Read Path)
*   **Endpoint:** GET /api/home
*   **Performance:** 100% served from Redis or Memory. **Zero synchronous calls to products.**
*   **Latency:** < 10ms target.

### Personalization & AI
*   **Signals:** Products push "Signals" (e.g., interest: travel) to Redis.
*   **LLM Integration:** Home Core uses OpenAI/OpenRouter to generate a dynamic "Welcome Message" based on these signals (e.g., "Welcome back! Ready for your trip to Mallorca?").
*   **Fallback:** If the LLM is slow (>1.2s), a static greeting is used.

---

## 3. Resilience: The "Crash-Proof" Home

The Home page must **never** show an error screen, even if the database is down. We use a 3-Layer Fallback strategy:

| Layer | Source | Latency | Condition |
| :--- | :--- | :--- | :--- |
| **1. Hot** | **Redis** | < 5ms | Normal operation. |
| **2. Warm** | **In-Memory LKG** | < 1ms | Redis timeout (>40ms) or connection failure. Serves the last successful feed seen by this instance. |
| **3. Cold** | **Static Baseline** | 0ms | Cold start + Redis down. Serves hardcoded "Top Products" widgets. |

**Result:** The Read-Path is decoupled from Product uptime AND Database uptime.

---

## 4. Server-Driven UI (SDUI)

We define a strict JSON schema shared across platforms.

### Schema Example
`json
{
  "widgetId": "travel.top-deal",
  "priority": 100,
  "components": [
    {
      "type": "HeroBanner",
      "props": {
        "title": "Mallorca Deal",
        "imageUrl": "https://..."
      }
    }
  ]
}
`

### Supported Components
*   **HeroBanner:** High-impact visual for top offers.
*   **TextCard:** Simple status updates or hints.
*   **CompactRow:** Horizontal scrollable list (e.g., "Last viewed hotels").

---

## 5. Infrastructure & Deployment

The PoC is designed for **Azure** using **Bicep** (IaC).

*   **Compute:** Azure Container Apps (Serverless Containers). Scales to zero.
*   **Database:** Azure Cache for Redis (Managed).
*   **Frontend:** Azure Storage Static Websites (Cheap, high availability).
*   **CDN:** Azure CDN (optional for production) for caching static assets.

### Scalability
*   **Stateless Core:** Can scale horizontally to thousands of instances via KEDA (HTTP trigger).
*   **Redis:** Handles high throughput. Keys are partitioned by User ID.
*   **Cost:** Storage costs scale with *active* users (TTL cleans up inactive data).

---

## 6. Decision Rationale

| Decision | Why? | Trade-off |
| :--- | :--- | :--- |
| **Push vs. Pull** | Pulling from 60 products at runtime is a distributed monolith anti-pattern. One slow product would slow down Home. | Eventual consistency. Products must implement push logic. |
| **SDUI** | Allows products to change layout/content without App Store updates. | Client rendering logic is generic; complex custom animations are harder. |
| **Redis as Primary** | We need O(1) access speed. The data model (Key-Value) fits perfectly. | RAM is more expensive than disk. Mitigated by short TTLs. |
| **Fastify** | Low overhead, high performance Node.js framework. | Smaller ecosystem than Express (but sufficient for API). |

## 7. Future Improvements (Beyond PoC)
*   **Edge Caching:** Move the LKG cache to the CDN edge (e.g., Cloudflare Workers).
*   **Personalization Engine:** A dedicated service to rank widgets using ML instead of simple priority scores.
*   **GraphQL:** Could be used for the Read-Path to allow clients to request specific widget fields.
