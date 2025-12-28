# CHECK24 GenDev Technical Concept Challenge - Home Widgets

Submission for the GenDev IT Scholarship Challenge.
This repository contains the technical concept and a fully functional Proof of Concept (PoC) for a decentralized, push-based Home Widgets platform.

##  Deliverables

| Deliverable | Description |
| :--- | :--- |
|  **[Technical Concept](check24-challenge-poc/docs/CONCEPT.md)** | Architecture, data flow, and design decisions. |
|  **[Developer Guidelines](check24-challenge-poc/docs/DEVELOPER_GUIDELINE.md)** | Integration guide for product teams. |
|  **[Application Video](check24-challenge-poc/docs/poc-video.mp4)** | 5-minute walkthrough of the concept and PoC. |
|  **[Live Deployment](https://c24w2yw4ryh.z6.web.core.windows.net/)** | Live demo running on Azure. |

---

##  The Concept: Push-Based & Decentralized

This PoC implements a **Push-based Snapshot Architecture** to decouple the central Home from decentralized product services ("speedboats").

- **Zero Read-Path Dependencies:** The Home API (GET /api/home) serves data exclusively from its own Redis cache. It never calls product services synchronously.
- **Decentralized Ownership:** Product teams calculate personalized offers and "push" widget snapshots to the Home Core.
- **Server-Driven UI (SDUI):** A unified JSON schema allows Web and Android clients to render widgets dynamically without app updates.
- **High Availability:** A 3-layer fallback strategy (Redis  In-Memory LKG  Static Baseline) ensures the Home page never breaks, even during total database outages.

##  Key Features

- **Multi-Platform:**
  - **Web:** React + Vite + TypeScript (Home + 3 Product Speedboats).
  - **Mobile:** Native Android App (Kotlin + Jetpack Compose).
- **Cross-Domain SSO:** Seamless "Handoff" authentication when navigating from Home to Product sites.
- **Personalization:**
  - Click tracking on product offers triggers "Personalized Hint" widgets on Home.
  - AI-generated welcome messages (LLM integration) based on user context.
- **Resilience:** "Crash-proof" design. If Redis dies, the in-memory "Last Known Good" cache takes over immediately.

##  Repository Structure

- services/home-core: Central Orchestrator API (Fastify + Redis + MongoDB).
- services/speedboat-*: Decentralized product services (Travel, DSL, Insurance).
- Frontend-web: Central Home Web App.
- Frontend-products/*: Independent Product Web Apps.
- Frontend-mobile/android: Native Android Client.
- infra: Docker Compose (local) and Bicep (Azure) configuration.
- docs: Detailed architectural documentation.

---

##  Azure Deployment (Recommended)

This project is designed to be deployed to Azure using Infrastructure-as-Code (Bicep).
The deployment includes **Azure Container Apps** (Backend), **Azure Cache for Redis**, and **Azure Storage Static Websites** (Frontend).

### 1. Prerequisites
- Azure CLI installed and logged in (az login).
- PowerShell.

### 2. Run Deployment Script
The deploy.ps1 script handles resource provisioning, building, and deployment.

`powershell
./infra/azure/deploy.ps1 -ResourceGroup "c24-home-widgets-poc" -Location "germanywestcentral"
`

**What this does:**
1. Provisions Azure resources via Bicep.
2. Builds Docker images for Home Core and Speedboats (ACR).
3. Deploys Container Apps.
4. Builds and uploads Static Web Apps (Home + Products).
5. Prints the **Public URLs** for the live environment.

See infra/azure/README.md for advanced configuration.

---

##  Local Development

You can also run the entire stack locally for development.

### 1. Start Backend & Services
Run the full stack (Home Core, Redis, 3 Speedboats) with Docker Compose:

`powershell
docker compose -f infra/docker-compose.yml up --build
`

- **Home Core:** http://localhost:3000
- **Speedboats:** Ports 3001, 3002, 3003

### 2. Start Web Clients
Open a new terminal for the Home Web App:

`powershell
cd frontend-web
npm install
npm run dev
`
Access at: http://localhost:5173

(Optional) Start a product web app to test the full flow:
`powershell
cd frontend-products/travel-web
npm install
npm run dev
`

### 3. Run Android App
Open Frontend-mobile/android in Android Studio and run the App configuration on an emulator.
*Note: Ensure local.properties points to your Android SDK.*

---

*Built with  for the CHECK24 GenDev Challenge.*
