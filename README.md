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
