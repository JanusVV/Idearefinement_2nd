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
  name: '',
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
  agentResults: [],
  refinements: [],
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
 * Build a human-readable summary of which fields a patch changes.
 */
function buildChangeSummary(project, patch, allowed) {
  const parts = [];
  for (const [key, value] of Object.entries(patch)) {
    if (!allowed.has(key) || value === undefined) continue;
    const old = project[key];
    if (JSON.stringify(old) === JSON.stringify(value)) continue;
    if (Array.isArray(value)) {
      const oldLen = Array.isArray(old) ? old.length : 0;
      parts.push(`${key}: ${oldLen} → ${value.length} items`);
    } else if (typeof value === 'string' && value.length > 0) {
      const preview = value.length > 80 ? value.slice(0, 80) + '…' : value;
      parts.push(`${key}: "${preview}"`);
    } else if (typeof value === 'number') {
      parts.push(`${key}: ${old ?? '—'} → ${value}`);
    } else {
      parts.push(`${key} updated`);
    }
  }
  return parts.length ? parts.join('; ') : null;
}

/**
 * Apply a patch to a project. Only top-level keys present in patch are updated.
 * Automatically records a refinement entry capturing what changed.
 *
 * Special patch keys (stripped before applying):
 *   _refinementNote  – optional free-text note from the caller (e.g. model screen text)
 *   _refinementSource – optional source label: 'voice' | 'worker' | 'manual' (default: 'voice')
 */
function applyPatch(project, patch) {
  const allowed = new Set([
    'name', 'snapshot', 'track', 'rigor', 'phase', 'backlog', 'risks', 'decisions',
    'openQuestions', 'nextActions', 'checkpoint', 'constraints', 'mvp', 'nonGoals',
    'validationPlan', 'buildPlan', 'moduleState', 'lastActiveAt', 'agentResults'
  ]);

  const refinementNote = patch._refinementNote || '';
  const refinementSource = patch._refinementSource || 'voice';
  const cleanPatch = { ...patch };
  delete cleanPatch._refinementNote;
  delete cleanPatch._refinementSource;

  const changeSummary = buildChangeSummary(project, cleanPatch, allowed);

  const next = { ...project };
  for (const [key, value] of Object.entries(cleanPatch)) {
    if (allowed.has(key) && value !== undefined) next[key] = value;
  }
  if (cleanPatch.phase !== undefined) next.phase = cleanPatch.phase;

  const now = new Date().toISOString();
  next.version = (next.version || 1) + 1;
  next.lastActiveAt = now;

  if (changeSummary) {
    if (!Array.isArray(next.refinements)) next.refinements = [];
    next.refinements.push({
      id: uuidv4(),
      timestamp: now,
      version: next.version,
      phase: next.phase,
      source: refinementSource,
      summary: refinementNote || changeSummary,
      fieldsChanged: changeSummary,
    });
  }

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
    return p ? { projectId: p.projectId, name: p.name || '', snapshot: p.snapshot, phase: p.phase, lastActiveAt: p.lastActiveAt } : null;
  }).filter(Boolean);
}

/**
 * Add a manual refinement entry to a project (no patch required).
 */
function addRefinement(project, { summary, source = 'manual' }) {
  const now = new Date().toISOString();
  if (!Array.isArray(project.refinements)) project.refinements = [];
  const entry = {
    id: uuidv4(),
    timestamp: now,
    version: project.version,
    phase: project.phase,
    source,
    summary: summary || '',
    fieldsChanged: null,
  };
  project.refinements.push(entry);
  project.lastActiveAt = now;
  return entry;
}

/**
 * Export all refinements for a project as a Markdown string.
 */
function refinementsToMarkdown(project) {
  const name = project.name || 'Untitled Idea';
  const lines = [
    `# Refinement History: ${name}`,
    '',
    `**Project ID:** ${project.projectId}`,
    `**Current Phase:** ${project.phase || 1}`,
    `**Track / Rigor:** ${project.track || '—'} / ${project.rigor || '—'}`,
    `**Snapshot:** ${project.snapshot || '—'}`,
    '',
    '---',
    '',
  ];

  const refinements = Array.isArray(project.refinements) ? project.refinements : [];
  if (refinements.length === 0) {
    lines.push('*No refinements recorded yet.*');
  } else {
    lines.push(`## Entries (${refinements.length} total)`);
    lines.push('');
    for (const r of refinements) {
      const date = r.timestamp ? new Date(r.timestamp).toLocaleString() : '—';
      lines.push(`### ${date}`);
      lines.push('');
      lines.push(`- **Source:** ${r.source || '—'}`);
      lines.push(`- **Phase at time:** ${r.phase ?? '—'}`);
      lines.push(`- **Version:** ${r.version ?? '—'}`);
      if (r.fieldsChanged) {
        lines.push(`- **Fields changed:** ${r.fieldsChanged}`);
      }
      lines.push('');
      if (r.summary) {
        lines.push(r.summary);
        lines.push('');
      }
      lines.push('---');
      lines.push('');
    }
  }

  return lines.join('\n');
}

module.exports = {
  load,
  save,
  applyPatch,
  create,
  list,
  addRefinement,
  refinementsToMarkdown,
  DEFAULT_PROJECT,
  DATA_DIR,
};
