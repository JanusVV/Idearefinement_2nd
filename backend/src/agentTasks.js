/**
 * Async agent tasks: create task, run worker in background, store result and attach to project.
 * Tasks are stored under data/agent-tasks/; completed results are also appended to project.agentResults.
 */

const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const { createScopedLogger } = require('./logger');
const agents = require('./agents');
const registry = require('./registry');

const log = createScopedLogger('AgentTasks');
const workers = {
  prdLite: require('./workers/prdLite'),
  competitorScan: require('./workers/competitorScan'),
  riskRegister: require('./workers/riskRegister'),
  ossDiscovery: require('./workers/ossDiscovery'),
  documentPolisher: require('./workers/documentPolisher'),
};

const BASE_DIR = process.env.REGISTRY_DATA_DIR
  ? path.join(path.dirname(process.env.REGISTRY_DATA_DIR), 'agent-tasks')
  : path.join(process.cwd(), 'data', 'agent-tasks');
const MAX_PROJECT_AGENT_RESULTS = 10;

function ensureDir() {
  if (!fs.existsSync(BASE_DIR)) fs.mkdirSync(BASE_DIR, { recursive: true });
}

function taskPath(taskId) {
  return path.join(BASE_DIR, `${taskId}.json`);
}

function loadTask(taskId) {
  ensureDir();
  const file = taskPath(taskId);
  if (!fs.existsSync(file)) return null;
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function saveTask(task) {
  ensureDir();
  fs.writeFileSync(taskPath(task.taskId), JSON.stringify(task, null, 2), 'utf8');
}

async function runWorkerForTask(task) {
  log.info(`Running worker "${task.workerType}" for task ${task.taskId}`, {
    agentId: task.agentId,
    projectId: task.projectId,
    configModel: task.agentConfig?.model || '(none)',
    configKey: task.agentConfig?.apiKeyEnvVar || '(none)',
  });

  const project = registry.load(task.projectId);
  if (!project) {
    task.status = 'failed';
    task.error = 'Project not found';
    task.completedAt = new Date().toISOString();
    saveTask(task);
    log.error(`Task ${task.taskId} failed: project not found`, { projectId: task.projectId });
    return;
  }
  const worker = workers[task.workerType];
  if (!worker) {
    task.status = 'failed';
    task.error = 'Unknown worker type: ' + task.workerType;
    task.completedAt = new Date().toISOString();
    saveTask(task);
    log.error(`Task ${task.taskId} failed: unknown worker`, { workerType: task.workerType });
    return;
  }
  const t0 = Date.now();
  try {
    const options = { agentConfig: task.agentConfig || {}, taskDescription: task.taskDescription || '' };
    const result = await worker.run(project, options);
    const elapsedMs = Date.now() - t0;
    task.status = 'completed';
    task.result = result.structuredResult;
    task.suggestedPatch = result.suggestedPatch;
    task.confidence = result.confidence;
    task.completedAt = new Date().toISOString();
    saveTask(task);

    log.info(`Task ${task.taskId} completed in ${elapsedMs}ms`, {
      agentId: task.agentId,
      confidence: result.confidence,
      resultPreview: JSON.stringify(result.structuredResult).slice(0, 200),
    });

    const updated = registry.load(task.projectId);
    if (updated) {
      const agentResults = Array.isArray(updated.agentResults) ? updated.agentResults : [];
      const entry = {
        taskId: task.taskId,
        agentId: task.agentId,
        agentName: task.agentName,
        taskDescription: task.taskDescription,
        result: task.result,
        suggestedPatch: task.suggestedPatch,
        at: task.completedAt,
      };
      const next = agentResults.slice(-(MAX_PROJECT_AGENT_RESULTS - 1));
      next.push(entry);
      const patched = registry.applyPatch(updated, { agentResults: next });
      registry.save(patched);
      log.info(`Agent result attached to project ${task.projectId}`);
    }
  } catch (e) {
    const elapsedMs = Date.now() - t0;
    task.status = 'failed';
    task.error = e.message || String(e);
    task.completedAt = new Date().toISOString();
    saveTask(task);
    log.error(`Task ${task.taskId} failed after ${elapsedMs}ms`, e);
  }
}

function createAndRun(projectId, agentIdOrName, taskDescription) {
  const agent = agents.get(agentIdOrName);
  if (!agent) throw new Error('Unknown agent: ' + agentIdOrName);
  const project = registry.load(projectId);
  if (!project) throw new Error('Project not found');

  const taskId = uuidv4();
  const task = {
    taskId,
    projectId,
    agentId: agent.agentId,
    agentName: agent.name,
    workerType: agent.workerType,
    agentConfig: agent.config || {},
    taskDescription: (taskDescription || '').trim() || agent.description,
    status: 'pending',
    createdAt: new Date().toISOString(),
  };
  saveTask(task);
  log.info(`Task created: ${taskId}`, {
    agentId: agent.agentId,
    agentName: agent.name,
    workerType: agent.workerType,
    projectId,
    llmConfigured: !!(agent.config?.model && agent.config?.apiKeyEnvVar),
  });
  setImmediate(() => {
    task.status = 'running';
    saveTask(task);
    runWorkerForTask(task);
  });
  return { taskId, status: 'pending', agentId: agent.agentId, agentName: agent.name };
}

function listTasks(projectId, options = {}) {
  ensureDir();
  const { status, since } = options;
  const files = fs.readdirSync(BASE_DIR).filter((f) => f.endsWith('.json'));
  let tasks = files
    .map((f) => {
      try {
        return JSON.parse(fs.readFileSync(path.join(BASE_DIR, f), 'utf8'));
      } catch (_) {
        return null;
      }
    })
    .filter(Boolean);
  if (projectId) tasks = tasks.filter((t) => t.projectId === projectId);
  if (status) tasks = tasks.filter((t) => t.status === status);
  if (since) tasks = tasks.filter((t) => (t.completedAt || t.createdAt) >= since);
  tasks.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  return tasks;
}

function getTask(taskId) {
  return loadTask(taskId);
}

module.exports = {
  createAndRun,
  listTasks,
  getTask,
  loadTask,
  BASE_DIR,
};
