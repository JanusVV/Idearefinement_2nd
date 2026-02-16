/**
 * Competitor / market scan worker.
 * If agentConfig has model + apiKeyEnvVar → calls LLM for real research.
 * Otherwise falls back to a placeholder response.
 */

const llm = require('../llmClient');
const { createScopedLogger } = require('../logger');
const log = createScopedLogger('Worker:CompetitorScan');

const SYSTEM_PROMPT = `You are a market research analyst. Given a product idea snapshot, produce a concise competitor / market scan.

Return your answer in this exact JSON format (no markdown fences):
{
  "note": "One-paragraph market overview",
  "competitors": [
    { "name": "Competitor A", "positioning": "One sentence", "differentiator": "One sentence" }
  ],
  "trends": ["trend 1", "trend 2"],
  "suggestedPositioning": "One sentence on how the idea can differentiate"
}`;

async function run(project, options = {}) {
  const agentConfig = options.agentConfig || {};
  const snapshot = (project.snapshot || '').slice(0, 500);
  const track = project.track || 'Personal';
  const taskDescription = options.taskDescription || '';
  const configured = llm.isConfigured(agentConfig);
  log.info('Starting competitor scan', { track, configured, model: agentConfig.model || '(none)', snapshotLen: snapshot.length });

  if (track === 'Personal' && !configured) {
    log.info('Skipped: Personal track, LLM not configured');
    return {
      structuredResult: { note: 'Competitor scan skipped for Personal track.', competitors: [] },
      confidence: 1,
      suggestedPatch: { snapshot: project.snapshot },
    };
  }

  if (!configured) {
    log.warn('LLM not configured, returning placeholder');
    const note = `Light market check for: "${snapshot}". Configure an LLM model and API key on this agent for a real scan.`;
    return {
      structuredResult: { note, competitors: [], suggestedNextStep: 'Set config.model and config.apiKeyEnvVar on the Market Research agent.' },
      confidence: 0.3,
      suggestedPatch: {
        validationPlan: (project.validationPlan || '') + '\n- [ ] Light competitor scan done (placeholder).',
      },
    };
  }

  const userPrompt = `Product idea: ${snapshot}\nTrack: ${track}\nRigor: ${project.rigor || 'Light'}${taskDescription ? '\nSpecific request: ' + taskDescription : ''}\n\nProduce the competitor / market scan JSON.`;

  const raw = await llm.chat(agentConfig, [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: userPrompt },
  ]);

  let parsed;
  try {
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : null;
  } catch (_) {
    parsed = null;
  }

  if (parsed) {
    return {
      structuredResult: parsed,
      confidence: 0.8,
      suggestedPatch: {
        validationPlan: (project.validationPlan || '') + '\n- [x] Competitor scan completed via ' + (agentConfig.model || 'LLM') + '.',
      },
    };
  }

  return {
    structuredResult: { note: raw.slice(0, 1500), competitors: [] },
    confidence: 0.6,
    suggestedPatch: {
      validationPlan: (project.validationPlan || '') + '\n- [x] Competitor scan completed (raw text).',
    },
  };
}

module.exports = { run };
