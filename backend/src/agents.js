/**
 * Configurable agents: file-based store. Each agent can be assigned a worker type
 * and optional config. Used by the conductor to delegate tasks.
 */

const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const DATA_DIR = process.env.REGISTRY_DATA_DIR
  ? path.join(path.dirname(process.env.REGISTRY_DATA_DIR), 'agents')
  : path.join(process.cwd(), 'data', 'agents');
const AGENTS_FILE = path.join(DATA_DIR, 'agents.json');

/**
 * Auto-detect an available LLM provider from environment variables.
 * Returns { model, apiKeyEnvVar } or {} if none found.
 */
function detectDefaultLLMConfig() {
  if (process.env.XAI_API_KEY) return { model: 'grok-4-1-fast', apiKeyEnvVar: 'XAI_API_KEY' };
  if (process.env.OPENAI_API_KEY) return { model: 'gpt-4o', apiKeyEnvVar: 'OPENAI_API_KEY' };
  if (process.env.ANTHROPIC_API_KEY) return { model: 'claude-sonnet-4-5', apiKeyEnvVar: 'ANTHROPIC_API_KEY' };
  return {};
}

const DEFAULT_AGENTS = [
  {
    agentId: 'marketResearch',
    name: 'Market Research',
    description: 'Find market trends, competitor landscape, and positioning for the idea.',
    workerType: 'competitorScan',
    config: detectDefaultLLMConfig(),
    enabled: true,
  },
  {
    agentId: 'prdSummary',
    name: 'PRD Summary',
    description: 'Generate a short product requirements summary from the current idea.',
    workerType: 'prdLite',
    config: detectDefaultLLMConfig(),
    enabled: true,
  },
  {
    agentId: 'riskRegister',
    name: 'Risk Register',
    description: 'Suggest risks and mitigations based on project snapshot and rigor.',
    workerType: 'riskRegister',
    config: detectDefaultLLMConfig(),
    enabled: true,
  },
  {
    agentId: 'ossScout',
    name: 'Open Source Scout',
    description: 'Discover relevant open source projects, libraries, and similar repos on GitHub that can be used as building blocks or references.',
    workerType: 'ossDiscovery',
    config: detectDefaultLLMConfig(),
    enabled: true,
  },
];

function ensureDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}

function readAll() {
  ensureDir();
  if (!fs.existsSync(AGENTS_FILE)) return [...DEFAULT_AGENTS];
  const raw = fs.readFileSync(AGENTS_FILE, 'utf8');
  const list = JSON.parse(raw);
  if (!Array.isArray(list) || list.length === 0) return [...DEFAULT_AGENTS];
  // Backfill empty config with auto-detected LLM provider
  const fallback = detectDefaultLLMConfig();
  if (fallback.model) {
    for (const agent of list) {
      if (!agent.config || (!agent.config.model && !agent.config.apiKeyEnvVar)) {
        agent.config = { ...fallback };
      }
    }
  }
  return list;
}

function writeAll(list) {
  ensureDir();
  fs.writeFileSync(AGENTS_FILE, JSON.stringify(list, null, 2), 'utf8');
}

function list() {
  return readAll().filter((a) => a.enabled !== false);
}

function get(agentId) {
  const all = readAll();
  return all.find((a) => a.agentId === agentId || (a.name && a.name.toLowerCase() === String(agentId).toLowerCase()));
}

function create(agent) {
  const all = readAll();
  const agentId = agent.agentId || (agent.name || '').toLowerCase().replace(/\s+/g, '') || uuidv4().slice(0, 8);
  if (all.some((a) => a.agentId === agentId)) throw new Error('Agent id already exists: ' + agentId);
  const newAgent = {
    agentId,
    name: agent.name || agentId,
    description: agent.description || '',
    workerType: agent.workerType || 'competitorScan',
    config: agent.config || {},
    enabled: agent.enabled !== false,
  };
  all.push(newAgent);
  writeAll(all);
  return newAgent;
}

function update(agentId, patch) {
  const all = readAll();
  const idx = all.findIndex((a) => a.agentId === agentId);
  if (idx === -1) return null;
  const allowed = new Set(['name', 'description', 'workerType', 'config', 'enabled']);
  const updated = { ...all[idx] };
  for (const [key, value] of Object.entries(patch)) {
    if (allowed.has(key)) updated[key] = value;
  }
  all[idx] = updated;
  writeAll(all);
  return updated;
}

function remove(agentId) {
  const all = readAll();
  const filtered = all.filter((a) => a.agentId !== agentId);
  if (filtered.length === all.length) return false;
  writeAll(filtered);
  return true;
}

module.exports = {
  list,
  get,
  create,
  update,
  remove,
  DATA_DIR,
};
