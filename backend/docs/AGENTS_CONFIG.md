# Configuring agents (models and API keys)

Agents are the workers the conductor can delegate to (e.g. Market Research, PRD Summary, Risk Register). You can configure **which model** each agent uses and **which API key** (via environment variables) without putting secrets in config files.

---

## Where to configure

### 1. Agent list and base config

- **File:** `backend/data/agents/agents.json`  
  (If you set `REGISTRY_DATA_DIR`, agents live under that parent as `agents/agents.json`.)
- **API:**  
  - `GET /agents` — list agents  
  - `GET /agents/:id` — get one  
  - `POST /agents` — create (body: `name`, `description`, `workerType`, `config`)  
  - `PATCH /agents/:id` — update (body: `name`, `description`, `workerType`, `config`, `enabled`)  
  - `DELETE /agents/:id` — remove  

Each agent has a **`config`** object. Use it for:

- **`model`** — model id for this agent (e.g. `gpt-5.2`, `claude-opus-4-6`, `grok-4`, `grok-4-1-fast`). Optional; workers may have a default.
- **`apiKeyEnvVar`** — **name** of the environment variable that holds the API key (e.g. `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `XAI_API_KEY` for Grok). The actual key is **never** stored in `config` or in the repo.

### 2. API keys (environment variables)

Put keys only in the environment (e.g. `.env` in the backend directory or your process manager). Never commit keys or put them in `agents.json`.

**Example `.env` (backend):**

```env
# Conductor / voice (Gemini) – used by the web client
# GEMINI_API_KEY=...

# Optional: for agents that call external LLMs
# OPENAI_API_KEY=...
# ANTHROPIC_API_KEY=...
# XAI_API_KEY=...   # xAI Grok (grok-4, grok-4-1-fast)
```

Then in an agent’s **config** (via file or `PATCH /agents/:id`), set the **env var name** only:

```json
{
  "agentId": "marketResearch",
  "name": "Market Research",
  "workerType": "competitorScan",
  "config": {
    "model": "gpt-5.2",
    "apiKeyEnvVar": "OPENAI_API_KEY"
  }
}
```

Workers receive `options.agentConfig` when they run; they should use:

- `options.agentConfig.model` for the model id
- `process.env[options.agentConfig.apiKeyEnvVar]` for the key (never store the key in config)

---

## Example: editing an agent’s model and API key

**Via API:**

```bash
# Set Market Research agent to use OpenAI GPT-5.2 (key from OPENAI_API_KEY)
curl -X PATCH http://localhost:3000/agents/marketResearch \
  -H "Content-Type: application/json" \
  -d '{"config":{"model":"gpt-5.2","apiKeyEnvVar":"OPENAI_API_KEY"}}'
```

**Via file:** edit `backend/data/agents/agents.json` and set the agent’s `config`:

```json
{
  "agentId": "marketResearch",
  "name": "Market Research",
  "description": "Find market trends, competitor landscape, and positioning for the idea.",
  "workerType": "competitorScan",
  "config": {
    "model": "gpt-5.2",
    "apiKeyEnvVar": "OPENAI_API_KEY"
  },
  "enabled": true
}
```

Then set `OPENAI_API_KEY` in your backend’s environment (e.g. in `.env`).

---

**Using Grok (xAI):** set `XAI_API_KEY` in `.env`, then e.g. `PATCH /agents/:id` with `{"config":{"model":"grok-4","apiKeyEnvVar":"XAI_API_KEY"}}`. Or in `agents.json`: `"config": { "model": "grok-4", "apiKeyEnvVar": "XAI_API_KEY" }`. Current Grok model ids: `grok-4`, `grok-4-1-fast` (check [xAI docs](https://docs.x.ai/docs/models) for current models).

---

## Default agents

If `agents.json` is missing or empty, the backend uses built-in defaults (see `backend/src/agents.js`). They start with `config: {}`. To use a specific model or provider for one of them, create or update that agent with the desired `config.model` and `config.apiKeyEnvVar` as above.

---

## Summary

| What            | Where |
|-----------------|--------|
| Agent list, names, worker type, **config** (model id, env var name) | `backend/data/agents/agents.json` or `PATCH /agents/:id` |
| **Actual API keys** | Backend environment only (e.g. `.env`); reference by name in `config.apiKeyEnvVar` |
