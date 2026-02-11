/**
 * Project registry: schema and file-based persistence.
 * Per Buildingspecs: canonical truth per project; every turn updates with a structured patch.
 */

const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const DATA_DIR = process.env.REGISTRY_DATA_DIR || path.join(process.cwd(), 'data', 'projects');
const DEFAULT_PROJECT = {
  projectId: null,
  snapshot: '',
  track: 'Personal',
  rigor: 'Light',
  phase: 1,
  backlog: [],
  risks: [],
  decisions: [],
  openQuestions: [],
  nextActions: [],
  checkpoint: null,
  constraints: [],
  mvp: '',
  nonGoals: '',
  validationPlan: '',
  buildPlan: '',
  lastActiveAt: null,
  version: 1,
  moduleState: {},
};

function ensureDataDir() {
  const dir = path.dirname(DATA_DIR);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}

function projectPath(projectId) {
  return path.join(DATA_DIR, `${projectId}.json`);
}

function load(projectId) {
  ensureDataDir();
  const file = projectPath(projectId);
  if (!fs.existsSync(file)) return null;
  const raw = fs.readFileSync(file, 'utf8');
  return JSON.parse(raw);
}

function save(project) {
  ensureDataDir();
  const file = projectPath(project.projectId);
  fs.writeFileSync(file, JSON.stringify(project, null, 2), 'utf8');
  return project;
}

/**
 * Apply a patch to a project. Only top-level keys present in patch are updated.
 */
function applyPatch(project, patch) {
  const allowed = new Set([
    'snapshot', 'track', 'rigor', 'phase', 'backlog', 'risks', 'decisions',
    'openQuestions', 'nextActions', 'checkpoint', 'constraints', 'mvp', 'nonGoals',
    'validationPlan', 'buildPlan', 'moduleState', 'lastActiveAt'
  ]);
  const next = { ...project };
  for (const [key, value] of Object.entries(patch)) {
    if (allowed.has(key) && value !== undefined) next[key] = value;
  }
  if (patch.phase !== undefined) next.phase = patch.phase;
  next.version = (next.version || 1) + 1;
  next.lastActiveAt = new Date().toISOString();
  return next;
}

function create(overrides = {}) {
  const projectId = overrides.projectId || uuidv4();
  const project = {
    ...DEFAULT_PROJECT,
    projectId,
    ...overrides,
    lastActiveAt: new Date().toISOString(),
    version: 1,
  };
  save(project);
  return project;
}

function list() {
  ensureDataDir();
  if (!fs.existsSync(DATA_DIR)) return [];
  const files = fs.readdirSync(DATA_DIR).filter((f) => f.endsWith('.json'));
  return files.map((f) => {
    const id = f.replace(/\.json$/, '');
    const p = load(id);
    return p ? { projectId: p.projectId, snapshot: p.snapshot, phase: p.phase, lastActiveAt: p.lastActiveAt } : null;
  }).filter(Boolean);
}

module.exports = {
  load,
  save,
  applyPatch,
  create,
  list,
  DEFAULT_PROJECT,
  DATA_DIR,
};
