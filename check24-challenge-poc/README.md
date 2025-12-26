# check24-challenge-poc

Monorepo skeleton for the CHECK24 technical concept challenge.

## Folders
- `services/home-core`: Home Core API (ingest + home)
- `services/speedboat-travel`: Mock speedboat pushing snapshots
- `frontend-web`: Web client (React/Vite)
- `frontend-mobile`: Android client (Kotlin/Compose)
- `infra/docker-compose.yml`: Local dev stack
- `docs`: Concept + integration guideline

## Local dev

### Backend + Redis + Speedboat (Docker)
- `docker compose -f infra/docker-compose.yml up --build`
- Home API: `http://localhost:3000/api/home`

### Web (Vite)
- `cd frontend-web`
- `npm install`
- `npm run dev`

### Android (Native)
- Open the Android project in Android Studio: `frontend-mobile/android`
- Emulator uses host URL: `http://10.0.2.2:3000/`
- Note: HTTP is allowed only in the `debug` build type (release requires HTTPS).
