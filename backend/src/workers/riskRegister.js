/**
 * Risk register worker: suggests risks and mitigations.
 * If agentConfig has model + apiKeyEnvVar → calls LLM for real risk analysis.
 * Otherwise falls back to hardcoded defaults.
 */

const llm = require('../llmClient');
const { createScopedLogger } = require('../logger');
const log = createScopedLogger('Worker:RiskRegister');

const SYSTEM_PROMPT = `You are a risk analyst. Given a product idea, track, and rigor level, produce a risk register.

Return your answer in this exact JSON format (no markdown fences):
{
  "risks": [
    { "id": "short-id", "label": "Risk title", "severity": "low|medium|high", "mitigation": "One sentence mitigation" }
  ],
  "note": "One-paragraph summary of the overall risk posture"
}

Include 4–8 risks. Consider: scope creep, market fit, technical feasibility, regulatory/legal, team capacity, security, user adoption, and financial viability as applicable.`;

async function run(project, options = {}) {
  const agentConfig = options.agentConfig || {};
  const snapshot = (project.snapshot || '').slice(0, 500);
  const track = project.track || 'Personal';
  const rigor = project.rigor || 'Light';
  const existingRisks = project.risks || [];
  const taskDescription = options.taskDescription || '';
  const configured = llm.isConfigured(agentConfig);
  log.info('Starting risk analysis', { track, rigor, configured, model: agentConfig.model || '(none)', existingRisks: existingRisks.length });

  if (!configured) {
    log.warn('LLM not configured, returning default risks');
    const defaultRisks = [
      { id: 'scope', label: 'Scope creep', mitigation: 'Keep MVP minimal; defer non-core features.' },
      { id: 'validation', label: 'Low validation', mitigation: 'Talk to 3–5 potential users before building more.' },
    ];
    if (track === 'Commercial') {
      defaultRisks.push({ id: 'market', label: 'Market fit', mitigation: 'Validate demand with early adopters or pre-sales.' });
    }
    if (rigor === 'High-stakes' || track === 'Internal') {
      defaultRisks.push({ id: 'stakeholders', label: 'Stakeholder alignment', mitigation: 'Document decisions and get sign-off on scope.' });
    }
    const newRisks = defaultRisks.filter(
      (r) => !existingRisks.some((e) => (e.id && e.id === r.id) || (e.label && e.label === r.label))
    );
    const risks = existingRisks.length ? [...existingRisks, ...newRisks] : defaultRisks;
    return {
      structuredResult: { risks, note: 'Default risk register (placeholder). Configure an LLM on this agent for deeper analysis.' },
      confidence: 0.5,
      suggestedPatch: { risks },
    };
  }

  const userPrompt = `Product idea: ${snapshot}\nTrack: ${track}, Rigor: ${rigor}\nExisting risks: ${existingRisks.length ? JSON.stringify(existingRisks) : '(none)'}${taskDescription ? '\nSpecific request: ' + taskDescription : ''}\n\nProduce the risk register JSON.`;

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

  if (parsed && Array.isArray(parsed.risks)) {
    return {
      structuredResult: parsed,
      confidence: 0.85,
      suggestedPatch: { risks: parsed.risks },
    };
  }

  return {
    structuredResult: { risks: existingRisks, note: raw.slice(0, 1500) },
    confidence: 0.5,
    suggestedPatch: {},
  };
}

module.exports = { run };
