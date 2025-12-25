# check24-challenge-poc

Monorepo skeleton for the CHECK24 technical concept challenge.

## Folders
- `services/home-core`: Home Core API (ingest + home)
- `services/speedboat-travel`: Mock speedboat pushing snapshots
- `frontend-web`: Web client (React/Vite)
- `frontend-mobile`: Android client (Kotlin/Compose)
- `infra/docker-compose.yml`: Local dev stack
- `docs`: Concept + integration guideline

## Local dev (later)
- `docker compose -f infra/docker-compose.yml up --build`
