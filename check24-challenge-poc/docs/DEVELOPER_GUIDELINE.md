# Developer Guideline: Home Widgets Integration

**Core Principle:** Decentralized & Push-based.
Product teams ("Speedboats") calculate offers and **push** UI snapshots to Home Core. The Home App never calls product services synchronously.

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
Use the provided Docker environment to test your integration.

1.  **Start Stack:** docker compose -f infra/docker-compose.yml up
2.  **Mock Push:**
    `bash
    curl -X POST http://localhost:3000/api/ingest \
      -H "x-product-id: travel" \
      -H "Content-Type: application/json" \
      -d @payload.json
    `
3.  **Verify:** Check http://localhost:5173 (Web) or Android Emulator.

---

## 5. Deployment
To deploy the full stack (including your Speedboat) to Azure:

1.  **Use the central script:** infra/azure/deploy.ps1
2.  **Reference:** See [Azure Deployment](../README.md#azure-deployment-recommended) in the main README.

In a production setup, your team would have an independent CI/CD pipeline deploying to your specific Azure Container App.

---

## 5. Deployment
To deploy the full stack (including your Speedboat) to Azure:

1.  **Use the central script:** infra/azure/deploy.ps1
2.  **Reference:** See [Azure Deployment](../README.md#azure-deployment-recommended) in the main README.

In a production setup, your team would have an independent CI/CD pipeline deploying to your specific Azure Container App.
