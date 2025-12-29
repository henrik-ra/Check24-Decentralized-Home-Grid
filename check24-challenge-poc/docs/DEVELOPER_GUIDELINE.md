# Developer Guideline: Home Widgets Integration

**Core Principle:** Decentralized & Push-based.
Product teams ("Speedboats") calculate offers and **push** UI snapshots to Home Core. The Home App never calls product services synchronously.

**PoC Context:** This PoC includes 3 schematic product speedboats (Travel, DSL, Insurance) with mock offer data to demonstrate the integration pattern. Real product teams would follow the same integration steps with production data.

## 1. Widget Definition (SDUI)
Widgets are JSON objects rendered natively by Android/Web clients.

### Schema Structure
`json
{
  "widgetId": "travel.lastminute.v1", // Unique identifier
  "priority": 100,                    // Display rank (1-1000)
  "ttl": 3600,                        // Expiry in seconds
  "components": [                     // Ordered list of UI elements
    {
      "type": "HeroBanner",
      "props": { ... }
    }
  ]
}
`

### Supported Components
Strictly typed. Unsupported types are silently ignored by clients.

| Component | Required Props | Optional Props | Usage |
| :--- | :--- | :--- | :--- |
| **HeroBanner** | 	itle, imageUrl | subtitle, price, ctaText, ActionUrl | High-impact offers. Max 1 per widget. |
| **TextCard** | 	itle, 	ext | label, ActionUrl | Status updates, reminders, personalized hints. |
| **CompactRow** | 	itle, items | - | Horizontal scrollable list of deep links. |

---

## 2. Push API
**Endpoint:** POST /api/ingest
**Auth:** Headers x-product-id and x-api-key.

### Request Payload
`json
{
  "userId": "user-uuid-1234",
  "widgetData": {
    "widgetId": "insurance.status.v1",
    "type": "card",
    "priority": 50,
    "components": [
      {
        "type": "TextCard",
        "props": {
          "title": "Application Approved",
          "text": "Your car insurance is active.",
          "actionUrl": "https://insurance.c24.de/details/123"
        }
      }
    ]
  }
}
`

### Integration Rules
1.  **Trigger-Based:** Push only on user interaction (Signal) or significant state change (e.g., price drop).
2.  **Rate Limit:** Max 10 requests/minute per user.
3.  **Payload Size:** Max 64KB.

---

## 3. Deep Linking & SSO
To ensure seamless navigation from Home to Product, use the **Handoff Protocol**.

1.  **Widget Link:** Set ActionUrl to your product landing page.
2.  **Token Injection:** Home App appends ?ssoToken=<jwt> when the user clicks.
3.  **Validation:** Your frontend/backend must validate the token to log the user in automatically.

**Example:**
https://travel.check24.de/offers/123?ssoToken=eyJhbGci...

---

## 4. Local Development

### Recommended: Cloud-First Development

**Frontend against deployed Azure backend** (fastest iteration):

```powershell
# 1. Get your deployed Home Core URL
cd check24-challenge-poc
az containerapp list --query "[?contains(name, 'home-core')].properties.configuration.ingress.fqdn" -o tsv

# 2. Create .env.local file in frontend-web/
cd frontend-web
echo "VITE_API_BASE_URL=https://c24-home-core-2yw4ry.nicecliff-bf76ea91.westeurope.azurecontainerapps.io" > .env.local

# 3. Start development server
npm install
npm run dev
# Access at http://localhost:5173
```

**Alternative: One-liner with cross-env**
```powershell
npx cross-env VITE_API_BASE_URL=https://c24-home-core-2yw4ry.nicecliff-bf76ea91.westeurope.azurecontainerapps.io npm run dev
```

### Alternative: Full Local Stack (Docker)

For offline development or when Azure is unavailable:

1.  **Start Stack:** `docker compose -f infra/docker-compose.yml up`
2.  **Mock Push:**
    ```bash
    curl -X POST http://localhost:3000/api/ingest \
      -H "x-product-id: travel" \
      -H "Content-Type: application/json" \
      -d @payload.json
    ```
3.  **Verify:** Check http://localhost:5173 (Web) or Android Emulator.

**Note:** Docker setup requires additional configuration (MongoDB connection string). Cloud-first development is recommended for this PoC.

---

## 5. Deployment

### Azure Deployment (PoC)

To deploy the full stack (including your Speedboat) to Azure:

**⚠️ Demo Credentials (PoC Only):**
The following MongoDB URI and JWT secret are provided for easy PoC evaluation. **In production, use Azure Key Vault and never commit secrets to Git.**

```powershell
cd check24-challenge-poc
./infra/azure/deploy.ps1 `
  -MongoDbUri "mongodb+srv://henrikrathai_db_user:9xP2ownqoZjTIN25@check24-challenge.wdumtpj.mongodb.net/" `
  -JwtSecret "dev-123-test"
```

This script:
1. Provisions Azure Container Apps, Redis, Storage Accounts via Bicep.
2. Builds and pushes Docker images to Azure Container Registry.
3. Deploys your speedboat alongside Home Core.
4. Outputs public URLs for all services.

**For advanced options:** See [Azure Deployment](../README.md#azure-deployment-recommended) in the main README.

### Production Deployment

In a production setup, your team would have an independent CI/CD pipeline deploying to your specific Azure Container App. Secrets would be managed via:
- **Azure Key Vault** for API keys, connection strings, JWT secrets.
- **Managed Identities** for Container Apps to access Key Vault without hardcoded credentials.
- **Azure DevOps / GitHub Actions** pipelines with environment-specific variable groups.

---

## 6. Development Strategy: Local vs. Cloud

### Recommended Approach: Cloud-First Development

This PoC is optimized for **Azure-first development**, where the backend runs in Azure and frontends are developed locally against the deployed environment.

**Why Cloud-First?**

| Aspect | Local Docker | Cloud-First (Azure) |
|--------|-------------|---------------------|
| **Setup Time** | 15 min (MongoDB, Redis, Docker) | 5 min (deploy script) |
| **Backend Changes** | 5s (restart container) | 3 min (redeploy) |
| **Frontend Changes** | Instant | Instant (run locally) |
| **Production Parity** | ⚠️ Different Redis/MongoDB versions | ✅ Identical to production |
| **Team Collaboration** | ❌ "Works on my machine" issues | ✅ Shared environment |
| **Costs** | Free | ~5 EUR/month (PoC tier) |
| **Offline Work** | ✅ Fully offline | ❌ Requires internet |

**Architectural Decision:**  
Because product teams deploy independently (potentially different tech stacks: Java, .NET, Node.js), maintaining a unified local docker-compose becomes a maintenance burden. Each team owns their deployment pipeline, and the Home Core team provides the Azure-deployed integration environment.

### Test Your Speedboat Integration

Use this script to verify your speedboat can push widgets to the deployed Home Core:

```powershell
# Get your deployed Home Core URL
$CORE_URL = "https://$(az containerapp list --query "[?contains(name, 'home-core')].properties.configuration.ingress.fqdn" -o tsv)"
$API_KEY = "dev-secret-123" # From deploy.ps1

# Or use the direct URL:
# $CORE_URL = "https://c24-home-core-2yw4ry.nicecliff-bf76ea91.westeurope.azurecontainerapps.io"

curl -X POST "$CORE_URL/api/ingest" `
  -H "x-product-id: TRAVEL" `
  -H "x-api-key: $API_KEY" `
  -H "Content-Type: application/json" `
  -H "idempotency-key: $(New-Guid)" `
  -d @'
{
  "userId": "test@example.com",
  "widgetData": {
    "widgetId": "travel.test.v1",
    "type": "hero_banner",
    "priority": 100,
    "components": [
      {
        "type": "HeroBanner",
        "props": {
          "title": "Barcelona 5 Tage",
          "subtitle": "Flug + Hotel ab 299 €",
          "imageUrl": "https://images.unsplash.com/photo-1583422409516-2895a77efded?w=150&h=150&fit=crop",
          "cta": {
            "label": "Jetzt buchen",
            "action": "deeplink",
            "deeplink": "https://travel.check24.de/offer/barcelona-5d"
          }
        }
      }
    ]
  }
}
'@

# Verify widget appears in Home
curl "$CORE_URL/api/home?userId=test@example.com"
```

**Expected Response:** Your widget appears in the `widgets` array with priority sorting.

### When to Use Local Docker

Use `docker-compose` if:
- ❌ No Azure subscription available
- ✅ Frequent backend changes (>10 per day)
- ✅ Offline development required (train/flight)
- ✅ Learning/experimenting without cloud costs

**Note:** The provided `docker-compose.yml` is a starting point but may require additional configuration (MongoDB connection string, environment-specific Redis settings) for full local development.
