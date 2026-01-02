# CHECK24 GenDev Technical Concept Challenge — Home Widgets

![Home Widgets — Web PoC](check24-challenge-poc/docs/images/check24-technical-concept-poc-home.png)

Submission for the GenDev IT Scholarship Challenge.
This repository contains the technical concept and a fully functional Proof of Concept (PoC) for a decentralized, push-based Home Widgets platform.

## 🎯 Problem Statement (Challenge Context)

CHECK24 is built around decentralized “speedboats” (independent product organizations) with full ownership of their systems and data.
There is intentionally **no shared persistence layer** across products, and **no tight technical coupling** between the central Home/Core and product systems.

At the same time, the Home experience must still feel personalized and consistent: relevant widgets should appear on the Home page across Web and App, based on what customers care about.

This creates a tension between:
- **Personalization vs. decentralization:** data and logic live in product domains, but the Home needs an aggregated view.
- **Freshness vs. performance:** widgets must be up-to-date without introducing slow, synchronous dependencies.
- **Flexibility vs. reliability:** products need autonomy to change independently, while Home must stay highly available.

This PoC demonstrates an architecture that allows products to contribute personalized widget content to a central Home experience while preserving speedboat autonomy and keeping the Home read-path fast and resilient.

## 📦 Deliverables

| Deliverable | Description |
| :--- | :--- |
|  **[Technical Concept](check24-challenge-poc/docs/CONCEPT.md)** | Architecture, data flow, and design decisions. |
|  **[Developer Guidelines](check24-challenge-poc/docs/DEVELOPER_GUIDELINE.md)** | Integration guide for product teams. |
|  **[Application Video](https://youtu.be/HjqHHvuhDmo)** | 5-minute walkthrough of the concept and PoC. |
|  **[Live Deployment](https://c24w2yw4ryh.z6.web.core.windows.net/)** | Live demo running on Azure. |

---

## 🧠 The Concept: Push-Based & Decentralized

This PoC implements a **Push-based Snapshot Architecture** to decouple the central Home from decentralized product services ("speedboats").

- **Zero Read-Path Dependencies:** The Home API (`GET /api/home`) serves data exclusively from its own Redis cache. It never calls product services synchronously.
- **Decentralized Ownership:** Product teams calculate personalized offers and "push" widget snapshots to the Home Core.
- **Independent Deployments:** Each product service (Travel, DSL, Insurance) is deployed independently—potentially on different tech stacks, languages, or even subdomains. This architectural independence is *why* a push-based approach is essential: it eliminates synchronous coupling and allows products to evolve autonomously.
- **Server-Driven UI (SDUI):** A unified JSON schema allows Web and Android clients to render widgets dynamically without app updates.
- **High Availability:** A 3-layer fallback strategy (Redis → In-Memory LKG → Static Baseline) ensures the Home page never breaks, even during total database outages.

## ✨ Key Features

- **Multi-Platform:**
  - **Web:** React + Vite + TypeScript (Home + 3 Product Speedboats).
  - **Mobile:** Native Android App (Kotlin + Jetpack Compose).
- **Cross-Domain SSO:** Seamless "Handoff" authentication when navigating from Home to Product sites.
- **Personalization:**
  - Click tracking on product offers triggers "Personalized Hint" widgets on Home.
  - AI-generated welcome messages (LLM integration) based on user context.
- **Resilience:** "Crash-proof" design. If Redis dies, the in-memory "Last Known Good" cache takes over immediately.

**PoC Scope:** This PoC includes **3 schematic product speedboats** (Travel, DSL, Insurance) with mock offer data to simulate user interest and demonstrate the personalization engine. In production, real product services would integrate using the same push-based API.

## 🗂️ Repository Structure

- `check24-challenge-poc/services/home-core`: Central Orchestrator API (Fastify + Redis + MongoDB).
- `check24-challenge-poc/services/speedboat-*`: Decentralized product services (Travel, DSL, Insurance).
- `check24-challenge-poc/frontend-web`: Central Home Web App.
- `check24-challenge-poc/frontend-products/*`: Independent Product Web Apps.
- `check24-challenge-poc/frontend-mobile/android`: Native Android Client.
- `check24-challenge-poc/infra`: Docker Compose (local) and Bicep (Azure) configuration.
- `check24-challenge-poc/docs`: Detailed architectural documentation.

---

## ☁️ Azure Deployment (Recommended)

This project is designed to be deployed to Azure using Infrastructure-as-Code (Bicep).
The deployment includes **Azure Container Apps** (Backend), **Azure Cache for Redis**, and **Azure Storage Static Websites** (Frontend).

### 1. Prerequisites
- Azure CLI installed and logged in (`az login`).
- PowerShell.

### 2. Run Deployment Script
The deploy.ps1 script handles resource provisioning, building, and deployment.

**⚠️ Demo Credentials (PoC Only):**
For easy evaluation, this PoC includes MongoDB credentials and a demo JWT secret. **In production, these must NEVER be committed to Git.** Use Azure Key Vault + Managed Identities instead.

```powershell
cd check24-challenge-poc
./infra/azure/deploy.ps1 `
  -MongoDbUri "mongodb+srv://henrikrathai_db_user:9xP2ownqoZjTIN25@check24-challenge.wdumtpj.mongodb.net/" `
  -JwtSecret "dev-123-test"
```

**What this does:**
1. Provisions Azure resources via Bicep (Resource Group auto-created if missing).
2. Builds Docker images for Home Core and Speedboats → Pushes to Azure Container Registry.
3. Deploys Container Apps with provided MongoDB URI and JWT secret.
4. Builds and uploads Static Web Apps (Home + 3 Product frontends).
5. Prints the **Public URLs** for the live environment.

**Note:** An OpenRouter API key for LLM-based welcome messages is already included in the script (demo purposes). You can override it with `-OpenRouterApiKey "sk-or-v1-..."` if needed.

See `check24-challenge-poc/infra/azure/` for advanced configuration.

---

## 🧑‍💻 Local Frontend

Local full-stack deployment is intentionally not part of this PoC setup.
For fast UI iteration, run the frontends locally while connecting to the **deployed Azure backend**.

### 1. Deploy Backend to Azure

Deploy once via the Azure Deployment section above.

### 2. Get the Home Core URL from Azure

```powershell
cd check24-challenge-poc
az containerapp list --query "[?contains(name, 'home-core')].properties.configuration.ingress.fqdn" -o tsv
# Output: c24-home-core-2yw4ry.nicecliff-bf76ea91.westeurope.azurecontainerapps.io
```

### 3. Run the Home Web App locally against Azure

```powershell
cd frontend-web
npm install
npx cross-env VITE_API_BASE_URL=https://c24-home-core-2yw4ry.nicecliff-bf76ea91.westeurope.azurecontainerapps.io npm run dev

# Alternative: Create .env.local file for persistent configuration
# echo "VITE_API_BASE_URL=https://c24-home-core-2yw4ry.nicecliff-bf76ea91.westeurope.azurecontainerapps.io" > .env.local
# npm run dev
```

Access at: http://localhost:5173

---

*Built with love for the CHECK24 GenDev Challenge.*
