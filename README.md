# IdeaRefinement Voice Agent

Voice-first idea refinement using the [IdeaFramework v4](Specs/Buildingspecs.txt): persistent project registry, conductor (Gemini 3.0 Flash), and optional modular workers. Voice I/O is provided by the integrated [Voiceagent](https://github.com/JanusVV/Voiceagent) repo.

## Quick start (Docker)

1. Copy env and set your Gemini API key:
   ```bash
   cp .env.example .env
   # Edit .env: set GEMINI_API_KEY=
   ```

2. Start backend and web client:
   ```bash
   docker compose up --build
   ```

3. **Config:** The web image includes a default `config.js` (from `config.example.js`), so the app loads without a mount. To use your API key and backend:
   - Create `voice-agent/web-test/config.js` from `voice-agent/web-test/config.example.js`.
   - Set `GEMINI_API_KEY` (get one at [Google AI Studio](https://aistudio.google.com/apikey)) and `BACKEND_URL` to **http://localhost:3002**.
   - In `docker-compose.yml`, uncomment the `volumes` under the `web` service so your `config.js` is mounted into the container. Then run `docker compose up` again.

4. Open **http://localhost:3001** and click "Start conversation". The conductor will guide you with one question at a time; the **Screen layer** panel shows the current idea snapshot and registry.

## Without Docker

- **Backend:** `cd backend && npm install && npm start` (listens on port 3000). Set `REGISTRY_DATA_DIR` if you want a custom data path.
- **Web client:** `cd voice-agent/web-test && npx serve .` then open the URL (e.g. http://localhost:3000). In `config.js` set `BACKEND_URL` to `http://localhost:3000` (or your backend URL) to enable registry and conductor.

## Project layout

| Path | Purpose |
|------|--------|
| `Specs/` | Buildingspecs.txt, IdeaFramework v4 |
| `voice-agent/` | Cloned Voiceagent (Android + web-test); model set to Gemini 3.0 Flash |
| `backend/` | Registry API, conductor prompt, workers (PRD-lite, competitor scan) |
| `web-client/` | Dockerfile to serve `voice-agent/web-test` |

## API

- `GET/POST /projects`, `GET/PATCH /projects/:id` — registry
- `GET /prompts/conductor` — conductor system instruction for Gemini
- `POST /workers/:jobType` — run a worker (`prdLite`, `competitorScan`). Body: `{ "projectId": "..." }`

## Model

The voice/conductor model is **Gemini 3.0 Flash**. If the Live API does not yet support this ID, change the `MODEL` constant in `voice-agent/web-test/index.html` and `voice-agent/app/.../DirectGeminiLiveService.kt` to a supported model (e.g. `gemini-2.5-flash-native-audio-preview-12-2025`).
