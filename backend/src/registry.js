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
  status: 'In Progress',
  ideaConfidence: null,
  track: 'Personal',
  rigor: 'Light',
  rigorOverrides: '',
  phase: 1,
  sessionCount: 0,
  elevatorPitch: '',

  foundation: {
    spark: '',
    problemDefinition: '',
    solutionOutline: '',
    marketContext: '',
  },
  validation: {
    problemValidation: '',
    solutionValidation: '',
    marketAnalysis: '',
    ethicalImpact: '',
  },
  feasibility: {
    productRequirements: '',
    architecture: '',
    uxDesign: '',
    testPlanning: '',
  },
  viability: {
    businessModel: '',
    legalCompliance: '',
    sustainability: '',
  },
  goToMarket: {
    branding: '',
    marketing: '',
    launchStrategy: '',
  },
  execution: {
    metricsKPIs: '',
    riskManagement: '',
  },
  synthesis: {
    confidenceBreakdown: '',
    decisionLog: '',
    leanCanvas: '',
    handoffChecklist: '',
  },

  // Legacy flat fields kept for cross-cutting data
  snapshot: '',
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
  lastStructuredAt: null,
  version: 1,
  moduleState: {},
  agentResults: [],
  refinements: [],
  conversationTranscript: [],
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
  try {
    const raw = fs.readFileSync(file, 'utf8');
    return JSON.parse(raw);
  } catch (e) {
    console.error(`registry.load: failed to read/parse ${file}:`, e.message);
    return null;
  }
}

function save(project) {
  ensureDataDir();
  const file = projectPath(project.projectId);
  const tmpFile = file + '.tmp';
  try {
    fs.writeFileSync(tmpFile, JSON.stringify(project, null, 2), 'utf8');
    fs.renameSync(tmpFile, file);
  } catch (e) {
    try { fs.unlinkSync(tmpFile); } catch (_) {}
    throw e;
  }
  return project;
}

/** Phase object keys that use deep merge (spread existing + incoming). */
const PHASE_OBJECT_KEYS = new Set([
  'foundation', 'validation', 'feasibility', 'viability',
  'goToMarket', 'execution', 'synthesis',
]);

/**
 * Build a human-readable summary of which fields a patch changes.
 */
function buildChangeSummary(project, patch, allowed) {
  const parts = [];
  for (const [key, value] of Object.entries(patch)) {
    if (!allowed.has(key) || value === undefined) continue;
    const old = project[key];
    if (JSON.stringify(old) === JSON.stringify(value)) continue;
    if (PHASE_OBJECT_KEYS.has(key) && typeof value === 'object' && value !== null) {
      const subKeys = Object.keys(value).filter(k => value[k] !== undefined && value[k] !== '');
      if (subKeys.length) parts.push(`${key}: ${subKeys.join(', ')} updated`);
    } else if (Array.isArray(value)) {
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
 * Phase objects (foundation, validation, etc.) are deep-merged so individual
 * subsections can be patched without overwriting siblings.
 * Automatically records a refinement entry capturing what changed.
 *
 * Special patch keys (stripped before applying):
 *   _refinementNote  – optional free-text note from the caller (e.g. model screen text)
 *   _refinementSource – optional source label: 'voice' | 'worker' | 'manual' (default: 'voice')
 */
const ARRAY_FIELDS = new Set(['risks', 'decisions', 'openQuestions', 'nextActions', 'constraints', 'agentResults', 'refinements', 'conversationTranscript']);
const STRING_FIELDS = new Set([
  'name', 'snapshot', 'track', 'rigor', 'rigorOverrides', 'status',
  'elevatorPitch', 'mvp', 'nonGoals', 'validationPlan', 'buildPlan',
]);

function stripMarkersFromString(s) {
  return s
    .replace(/---JSON---[\s\S]*?---JSON---/g, '')
    .replace(/---AGENT---[\s\S]*?---AGENT---/g, '')
    .trim();
}

function sanitizePatchValues(obj) {
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined) continue;
    if (ARRAY_FIELDS.has(k) && !Array.isArray(v)) continue;
    if (STRING_FIELDS.has(k) && typeof v !== 'string') continue;
    if (k === 'phase' && (typeof v !== 'number' || v < 1 || v > 7)) continue;
    if (k === 'ideaConfidence' && v !== null && (typeof v !== 'number' || v < 0 || v > 100)) continue;
    if (k === 'sessionCount' && typeof v !== 'number') continue;
    if (typeof v === 'string') {
      out[k] = stripMarkersFromString(v);
    } else if (PHASE_OBJECT_KEYS.has(k) && typeof v === 'object' && v !== null && !Array.isArray(v)) {
      const sub = {};
      for (const [sk, sv] of Object.entries(v)) {
        if (typeof sv === 'string') sub[sk] = stripMarkersFromString(sv);
        else if (sv !== undefined) sub[sk] = sv;
      }
      out[k] = sub;
    } else {
      out[k] = v;
    }
  }
  return out;
}

function applyPatch(project, patch) {
  const allowed = new Set([
    'name', 'snapshot', 'track', 'rigor', 'phase', 'backlog', 'risks', 'decisions',
    'openQuestions', 'nextActions', 'checkpoint', 'constraints', 'mvp', 'nonGoals',
    'validationPlan', 'buildPlan', 'moduleState', 'lastActiveAt', 'agentResults',
    'status', 'ideaConfidence', 'rigorOverrides', 'sessionCount', 'elevatorPitch',
    'lastStructuredAt', 'conversationTranscript',
    'foundation', 'validation', 'feasibility', 'viability',
    'goToMarket', 'execution', 'synthesis',
  ]);

  const refinementNote = patch._refinementNote || '';
  const refinementSource = patch._refinementSource || 'voice';
  const cleanPatch = sanitizePatchValues({ ...patch });
  delete cleanPatch._refinementNote;
  delete cleanPatch._refinementSource;

  const changeSummary = buildChangeSummary(project, cleanPatch, allowed);

  const next = { ...project };
  for (const [key, value] of Object.entries(cleanPatch)) {
    if (!allowed.has(key) || value === undefined) continue;
    if (PHASE_OBJECT_KEYS.has(key) && typeof value === 'object' && value !== null) {
      const existing = (typeof next[key] === 'object' && next[key] !== null) ? next[key] : {};
      next[key] = { ...existing, ...value };
    } else {
      next[key] = value;
    }
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
  const base = JSON.parse(JSON.stringify(DEFAULT_PROJECT));
  const project = {
    ...base,
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
    return p ? { projectId: p.projectId, name: p.name || '', snapshot: p.snapshot || p.elevatorPitch, phase: p.phase, status: p.status, lastActiveAt: p.lastActiveAt } : null;
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

/** Phase layout for markdown export: [phaseKey, heading, [[fieldKey, subHeading], ...]] */
const PHASE_LAYOUT = [
  ['foundation', 'Phase 1: Foundation', [['spark', '1.1 The Spark'], ['problemDefinition', '1.2 Problem Definition'], ['solutionOutline', '1.3 Solution Outline'], ['marketContext', '1.4 Market Context']]],
  ['validation', 'Phase 2: Validation', [['problemValidation', '2.1 Problem Validation'], ['solutionValidation', '2.2 Solution Validation & UVP'], ['marketAnalysis', '2.3 Market & Audience Analysis'], ['ethicalImpact', '2.4 Ethical & Societal Impact']]],
  ['feasibility', 'Phase 3: Technical & Operational Feasibility', [['productRequirements', '3.1 Product Definition & Requirements'], ['architecture', '3.2 System Architecture & Technical Planning'], ['uxDesign', '3.3 UX/UI & Accessibility'], ['testPlanning', '3.4 Quality Engineering & Test Planning']]],
  ['viability', 'Phase 4: Viability & Business Model', [['businessModel', '4.1 Business Model & Financial Viability'], ['legalCompliance', '4.2 Legal, IP & Regulatory Compliance'], ['sustainability', '4.3 Sustainability & Social Impact']]],
  ['goToMarket', 'Phase 5: Go-to-Market Strategy', [['branding', '5.1 Branding & Positioning'], ['marketing', '5.2 Marketing & Customer Acquisition'], ['launchStrategy', '5.3 Launch Strategy']]],
  ['execution', 'Phase 6: Execution & Iteration', [['metricsKPIs', '6.1 Metrics & Feedback'], ['riskManagement', '6.2 Risk & Stakeholder Management']]],
  ['synthesis', 'Phase 7: Synthesis & Next Steps', [['confidenceBreakdown', 'Idea Confidence Breakdown'], ['decisionLog', 'Decision Log'], ['leanCanvas', 'Lean Canvas'], ['handoffChecklist', 'Handoff Checklist']]],
];

/**
 * Export the full refined idea as a structured Markdown document
 * matching the 7-phase output format.
 */
function projectToMarkdown(project) {
  const name = project.name || 'Untitled Idea';
  const confidence = project.ideaConfidence != null ? `${project.ideaConfidence}%` : '—';
  const overrides = project.rigorOverrides ? ` | **Rigor Overrides:** ${project.rigorOverrides}` : '';
  const sessions = project.sessionCount || '—';
  const lines = [];
  const push = (...l) => lines.push(...l);

  push(`# Refined Idea Output — ${name}`, '',
    `> **Project ID:** \`${project.projectId || '—'}\``,
    `> **Status:** ${project.status || 'In Progress'}`,
    `> **Idea Confidence:** ${confidence}`,
    `> **Track:** ${project.track || '—'} | **Global Rigor:** ${project.rigor || '—'}${overrides}`,
    `> **Last Updated:** ${project.lastActiveAt || new Date().toISOString()}`,
    `> **Sessions:** ${sessions}`, '', '---', '');

  if (project.elevatorPitch) push('## Elevator Pitch', '', project.elevatorPitch, '', '---', '');

  for (const [key, heading, subs] of PHASE_LAYOUT) {
    const data = project[key] || {};
    const filled = subs.filter(([k]) => data[k]);
    if (!filled.length) continue;
    push(`## ${heading}`, '');
    for (const [k, subH] of filled) push(`### ${subH}`, '', data[k], '');
    push('---', '');
  }

  const refs = Array.isArray(project.refinements) ? project.refinements : [];
  const agents = (Array.isArray(project.agentResults) ? project.agentResults : []).length;
  push(`*Generated by ${name} idea refinement session • ${sessions} sessions • ${refs.length} refinement entries • ${agents} agent calls*`);
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
  projectToMarkdown,
  DEFAULT_PROJECT,
  DATA_DIR,
};
