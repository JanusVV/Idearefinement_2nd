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

## Remote access (Cloudflare Tunnel)

The backend runs behind a **Cloudflare Tunnel** so it can be reached from anywhere — no port forwarding required, proper HTTPS with a valid certificate, works through double NAT and restrictive ISPs.

```bash
docker compose up -d          # starts backend + tunnel
docker logs idearefinement_2nd-tunnel-1   # find the public URL
```

The tunnel provides a URL like `https://<random>.trycloudflare.com`. Use this as your `BACKEND_URL` in the Android app settings. The URL changes when the tunnel container restarts; check the logs for the new one.

> **Permanent URL:** For a stable URL, create a free [Cloudflare Zero Trust](https://one.dash.cloudflare.com/) account, add a domain, and create a named tunnel with a fixed hostname. Replace the quick-tunnel command in `docker-compose.yml` with `tunnel run --token <YOUR_TOKEN>`.

## Android app

The Android app (`voice-agent/`) is a WebView wrapper that loads the web client while providing native services (foreground service for background audio, call screening).

1. Copy `voice-agent/local.properties.example` or create `voice-agent/local.properties`:
   ```properties
   sdk.dir=<path-to-android-sdk>
   GEMINI_API_KEY=<your-gemini-api-key>
   BACKEND_URL=https://<tunnel-url>.trycloudflare.com
   BACKEND_API_KEY=<your-backend-api-key>
   ```
2. Open `voice-agent/` in Android Studio and build to your device.
3. The backend URL can also be changed at runtime in the app's **Settings** screen.

## Without Docker

- **Backend:** `cd backend && npm install && npm start` (listens on port 3000). Set `REGISTRY_DATA_DIR` if you want a custom data path.
- **Web client:** `cd voice-agent/web-test && npx serve .` then open the URL (e.g. http://localhost:3000). In `config.js` set `BACKEND_URL` to `http://localhost:3000` (or your backend URL) to enable registry and conductor.

## Project layout

| Path | Purpose |
|------|--------|
| `Specs/` | Buildingspecs.txt, IdeaFramework v4 |
| `voice-agent/` | Android app (WebView hybrid) + web client (`web-test/`); Gemini Live API |
| `backend/` | Registry API, conductor prompt, document polisher, agent workers |
| `web-client/` | Dockerfile to serve `voice-agent/web-test` |

## API

- `GET/POST /projects`, `GET/PATCH /projects/:id` — registry
- `GET /prompts/conductor` — conductor system instruction for Gemini
- `POST /workers/:jobType` — run a worker (`prdLite`, `competitorScan`, `riskRegister`). Body: `{ "projectId": "...", "apply": true }`
- `GET/POST /agents`, `GET/PATCH/DELETE /agents/:id` — configurable agents (list, create, update, delete)
- `POST /agents/tasks` — start an agent task async. Body: `{ "projectId", "agentId", "taskDescription" }`. Returns `{ taskId, status: "pending" }`
- `GET /agents/tasks/list?projectId=&status=completed` — list tasks (for polling completed results)
- `GET /agents/tasks/:taskId` — get one task

## Configuring agents (models and API keys)

Agent definitions (name, worker type, **model**, **API key reference**) are stored in **`backend/data/agents/agents.json`** or updated via **`PATCH /agents/:id`**. Each agent has a **`config`** object where you can set:

- **`config.model`** — model id (e.g. `gpt-5.2`, `claude-opus-4-6`, `grok-4`)
- **`config.apiKeyEnvVar`** — **name** of the env var that holds the API key (e.g. `OPENAI_API_KEY`, `XAI_API_KEY`)

**API keys** are never stored in config; set them in the backend environment (e.g. `backend/.env`). See **`backend/docs/AGENTS_CONFIG.md`** for full details and examples.

## Supported models

### Conductor (voice)

Only **Gemini** is used for the real-time voice conductor (Live API). The app is set to:

- **`gemini-2.5-flash-native-audio-preview-12-2025`** (in `voice-agent/web-test/index.html` and `voice-agent/app/.../DirectGeminiLiveService.kt`)

To use a different Gemini model (e.g. when newer Live models are available), change the `MODEL` constant in those two files. The Live API supports only Gemini models that are enabled for `bidiGenerateContent`.

### Agents (delegate workers)

Agents are **configurable** by provider and model. You set **`config.model`** and **`config.apiKeyEnvVar`** per agent; the actual key goes in the backend environment (see `backend/docs/AGENTS_CONFIG.md`). Supported in the sense of "documented and env-ready":

| Provider       | Env var (API key)   | Example model ids                                  |
|---------------|---------------------|-----------------------------------------------------|
| **OpenAI**    | `OPENAI_API_KEY`    | `gpt-5.2`, `gpt-5`, `gpt-4o`                        |
| **Anthropic** | `ANTHROPIC_API_KEY` | `claude-opus-4-6`, `claude-sonnet-4-5`, `claude-haiku-4-5` |
| **xAI (Grok)**| `XAI_API_KEY`       | `grok-4`, `grok-4-1-fast`                           |

Use each provider's current model list ([OpenAI](https://platform.openai.com/docs/models), [Anthropic](https://docs.anthropic.com/en/docs/models-overview), [xAI](https://docs.x.ai/docs/models)) for up-to-date ids. The built-in workers (competitor scan, PRD-lite, risk register) do not call these APIs yet; once a worker is wired to an LLM, any model id you put in `config.model` for that provider is supported.
