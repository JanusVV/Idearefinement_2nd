/**
 * PRD-lite worker: generates a short product requirements summary.
 * If agentConfig has model + apiKeyEnvVar → calls LLM for a real PRD.
 * Otherwise falls back to a template.
 */

const llm = require('../llmClient');
const { createScopedLogger } = require('../logger');
const log = createScopedLogger('Worker:PRDLite');

const SYSTEM_PROMPT = `You are a product manager. Given a product idea snapshot, track, and MVP notes, produce a concise PRD-lite document.

Structure your response as markdown with these sections:
# PRD-lite
## Problem Statement
## Target Users
## Core Value Proposition
## MVP Scope (must-haves)
## Out of Scope (non-goals)
## Success Metrics
## Open Questions

Keep each section to 2–4 bullets. Be specific and actionable.`;

async function run(project, options = {}) {
  const agentConfig = options.agentConfig || {};
  const snapshot = project.snapshot || '';
  const mvp = project.mvp || '';
  const track = project.track || 'Personal';
  const phase = project.phase || 1;
  const taskDescription = options.taskDescription || '';
  const configured = llm.isConfigured(agentConfig);
  log.info('Starting PRD generation', { track, phase, configured, model: agentConfig.model || '(none)' });

  if (!configured) {
    log.warn('LLM not configured, returning template PRD');
    const prdLite = `# PRD-lite (Phase ${phase})
## Snapshot
${snapshot || '(none yet)'}

## MVP
${mvp || '(to be defined)'}

## Track
${track}

## Must-have (suggested)
- Clear problem statement
- One core benefit
- Minimal scope for first version

_Configure an LLM model and API key on the PRD Summary agent for a real PRD._
`;
    return {
      structuredResult: { prdLite, generatedAt: new Date().toISOString() },
      confidence: 0.4,
      suggestedPatch: { buildPlan: prdLite },
    };
  }

  const userPrompt = `Product idea: ${snapshot}\nTrack: ${track}, Rigor: ${project.rigor || 'Light'}, Phase: ${phase}\nMVP notes: ${mvp || '(none)'}\nNon-goals: ${project.nonGoals || '(none)'}\nConstraints: ${(project.constraints || []).join(', ') || '(none)'}${taskDescription ? '\nSpecific request: ' + taskDescription : ''}\n\nWrite the PRD-lite.`;

  const prdLite = await llm.chat(agentConfig, [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: userPrompt },
  ]);

  return {
    structuredResult: { prdLite, generatedAt: new Date().toISOString() },
    confidence: 0.85,
    suggestedPatch: {
      buildPlan: prdLite,
    },
  };
}

module.exports = { run };
