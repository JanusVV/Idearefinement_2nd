/**
 * Document Polisher worker.
 * Transforms a voice conversation transcript + raw project data
 * into structured, professional documentation using an LLM.
 *
 * Primary input: the full conversation transcript (user + model).
 * Secondary input: raw phase field data + agent results.
 */

const llm = require('../llmClient');
const { createScopedLogger } = require('../logger');
const log = createScopedLogger('Worker:DocumentPolisher');

/**
 * Detects raw field values that are conductor dialog rather than
 * structured data. Returns true if the value should be discarded.
 */
function looksLikeConductorDialog(text) {
  if (!text || typeof text !== 'string') return false;
  const t = text.trim();
  // Ends with a question mark — likely a conductor question
  if (t.endsWith('?')) return true;
  // Starts with conversational phrases conductors use
  const dialogStarts = [
    /^got it\b/i, /^let'?s\b/i, /^what was\b/i, /^what is\b/i,
    /^can you\b/i, /^tell me\b/i, /^was your\b/i, /^so you/i,
    /^a clear problem\b/i, /^that'?s a good/i, /^i notice/i,
    /^before we move/i, /^now let'?s/i, /^great —/i, /^excellent/i,
  ];
  if (dialogStarts.some(re => re.test(t))) return true;
  // No markdown formatting (bold, bullets, tables) and is short = likely dialog
  const hasFormatting = /\*\*|^\s*[-•*]\s|^\s*\d+\.\s|\|/m.test(t);
  if (!hasFormatting && t.length < 200) return true;
  return false;
}

const PHASE_FIELDS = {
  foundation: {
    spark: '1.1 The Spark — Use **Origin:** and **Inspiration:** labels.',
    problemDefinition: '1.2 Problem Definition — Use **Problem Statement (Five Whys):** numbered list, **Root Problem:** summary, **Target Audience:** description with demographics.',
    solutionOutline: '1.3 Solution Outline — Use **Solution:** with numbered core features/loops, **Core Benefit:** one-liner, **Low-Code/No-Code Feasibility:** assessment.',
    marketContext: '1.4 Market Context — Use **Top Competitors:** table (| App | Strength | Key Weakness |), **Major Trend:** paragraph, **Problem Growth:** paragraph.',
  },
  validation: {
    problemValidation: '2.1 Problem Validation — Use **Evidence gathered:** bullets, **Current Alternatives & Shortcomings:** bullets, **Pain Score:** X/10 with explanation.',
    solutionValidation: '2.2 Solution Validation & UVP — Use **Unique Value Proposition:** one-liner, **Key Assumptions Tested:** table (| # | Assumption | Test | Result | Status |), **De-risked:** summary.',
    marketAnalysis: '2.3 Market & Audience Analysis — Use **Ideal Customer Profile:** (Primary + Secondary), **Competitor Benchmarking:** summary, **SOM Estimation:** numbers, **Barriers:** list.',
    ethicalImpact: '2.4 Ethical & Societal Impact — Use **Assessment:** overview, **Flagged items:** bullets with severity.',
  },
  feasibility: {
    productRequirements: '3.1 Product Requirements — Use **MVP Scope (MoSCoW):** with **Must Have:**, **Should Have:**, **Could Have:**, **Won\'t Have (v1):** lists. Add **Acceptance Criteria:** examples.',
    architecture: '3.2 System Architecture — Use **Recommended Stack:** table (| Layer | Choice | Rationale |), **Key Architecture Decisions:** bullets, **Build Complexity:** estimate, **API Specification:** endpoints list.',
    uxDesign: '3.3 UX/UI & Accessibility — Use **Core User Flows:** numbered list, **Wireframe Direction:** description, **Accessibility Checklist:** bullets.',
    testPlanning: '3.4 Quality Engineering — Use **Test Strategy:** by type, **Quality Metrics:** with targets.',
  },
  viability: {
    businessModel: '4.1 Business Model — Use **Revenue Model:** type, **Pricing Tiers:** table, **Unit Economics:** metrics, **Break-even:** estimate, **Funding Strategy:**.',
    legalCompliance: '4.2 Legal & Compliance — Use **IP/FTO:** assessment, **Regulatory:** requirements, **Privacy-by-Design:** measures.',
    sustainability: '4.3 Sustainability — Assessment or note if skipped.',
  },
  goToMarket: {
    branding: '5.1 Branding — Use **Brand Identity:** (name, tagline, tone, visual), **Customer Journey Map:** table.',
    marketing: '5.2 Marketing — Use **Channel Prioritization:** numbered list, **Retention Hooks:** bullets, **Social Proof:** plan.',
    launchStrategy: '5.3 Launch Strategy — Use **Pre-Launch:** plan, **Launch Type:** description, **Post-Launch Feedback:** process, **Crisis Protocol:** if applicable.',
  },
  execution: {
    metricsKPIs: '6.1 Metrics — Use **North Star Metric:** and **KPI Dashboard:** table (| Category | Metric | Target |).',
    riskManagement: '6.2 Risk Management — Use **Risk Register:** table (| # | Risk | Likelihood | Impact | Mitigation |), **Kill Criteria:** list.',
  },
  synthesis: {
    confidenceBreakdown: 'Confidence Breakdown — Table (| Dimension | Status | Notes |).',
    decisionLog: 'Decision Log — Table (| # | Decision | Rationale | Phase |).',
    leanCanvas: 'Lean Canvas — Table with all 9 blocks.',
    handoffChecklist: 'Handoff Checklist — Bullet list of next-phase artifacts.',
  },
};

function buildSystemPrompt() {
  let fieldGuide = '';
  for (const [phase, fields] of Object.entries(PHASE_FIELDS)) {
    for (const [field, description] of Object.entries(fields)) {
      fieldGuide += `- "${phase}.${field}": ${description}\n`;
    }
  }

  return `You are a senior product consultant who transforms voice conversation transcripts from idea refinement sessions into structured, professional documentation.

YOUR PRIMARY INPUT is a conversation transcript between a user and an AI conductor. The user describes their idea, the conductor asks questions, and together they explore and refine the concept. Your job is to extract the SUBSTANCE of what the user said and what was discussed, then write it up as polished documentation.

CRITICAL RULES:
1. Extract information from the CONVERSATION TRANSCRIPT. This is your primary source of truth. The user's actual words contain the real idea, the real problem, and the real answers.
2. You also receive raw phase field data as secondary context. WARNING: These fields are often BADLY CAPTURED — they may contain:
   - Conductor dialog (questions the AI asked, not answers from the user)
   - Restatements that start with "Got it —" or "So you're saying..."
   - Content from DIFFERENT projects that leaked in by mistake
   - Questions ending in "?" that were never answered
   You MUST filter these out. Only use raw field data if it contains actual structured documentation (bold labels, bullets, tables) that aligns with the project topic.
3. Agent results (market research, competitor scans, etc.) are provided as additional data to incorporate.
4. NEVER fabricate information. Only document what was actually discussed or discovered. If a topic wasn't covered in the conversation, leave that field out of your response entirely.
5. Write in a professional but clear style. Use **bold labels**, markdown tables, bullet lists, and numbered lists.
6. Be specific — include real numbers, names, features, and details mentioned in the conversation.
7. Where the conversation discussed something substantively, write a thorough section (multiple paragraphs, tables, lists). Where it was only briefly mentioned, write a concise entry.
8. Do NOT include the section heading in the field value — the export system adds those.
9. DISCARD any raw field value that:
   - Reads like a conversational turn (question, prompt, or restatement)
   - Starts with "Got it", "Let's", "What was", "Can you", "A clear problem"
   - Ends with a question mark
   - Discusses a topic unrelated to the project name/elevator pitch
   These are conductor dialog fragments, NOT real data.

FIELD GUIDE (expected structure per field):
${fieldGuide}
ADDITIONAL FIELDS:
- "elevatorPitch": 2-3 sentence pitch based on the idea discussed. What it does, who it's for, why it's different.
- "ideaConfidence": Number 0-100 if enough data was discussed, otherwise null.
- "snapshot": One-sentence summary of the idea.
- "name": Project name if one was mentioned or can be inferred.

RESPONSE FORMAT:
Return ONLY a valid JSON object (no markdown fences, no explanation text). Include only fields where the conversation provided enough substance. Use nested structure:
{
  "name": "...",
  "elevatorPitch": "...",
  "snapshot": "...",
  "ideaConfidence": null,
  "foundation": { "spark": "...", "problemDefinition": "..." },
  "feasibility": { "architecture": "..." }
}`;
}

function buildUserPrompt(project, transcript) {
  const parts = [];

  if (transcript && transcript.trim().length > 50) {
    parts.push('## CONVERSATION TRANSCRIPT (primary source)\n');
    parts.push(transcript.slice(0, 15000));
    parts.push('\n');
  }

  parts.push('## PROJECT METADATA\n');
  parts.push(`Name: ${project.name || '(unnamed)'}`);
  parts.push(`Track: ${project.track || 'Personal'}`);
  parts.push(`Rigor: ${project.rigor || 'Light'}`);
  parts.push(`Phase: ${project.phase || 1}`);
  parts.push('');

  const phases = ['foundation', 'validation', 'feasibility', 'viability', 'goToMarket', 'execution', 'synthesis'];
  const rawFields = {};
  for (const phase of phases) {
    const data = project[phase];
    if (!data || typeof data !== 'object') continue;
    const filled = {};
    for (const [k, v] of Object.entries(data)) {
      if (v && typeof v === 'string' && v.trim() && !looksLikeConductorDialog(v)) filled[k] = v;
    }
    if (Object.keys(filled).length > 0) rawFields[phase] = filled;
  }
  if (Object.keys(rawFields).length > 0) {
    parts.push('## RAW PHASE FIELD DATA (secondary — may contain badly captured fragments)\n');
    parts.push(JSON.stringify(rawFields, null, 2));
    parts.push('');
  }

  if (Array.isArray(project.agentResults) && project.agentResults.length) {
    parts.push('## AGENT FINDINGS (incorporate relevant data)\n');
    for (const r of project.agentResults) {
      parts.push(`Agent: ${r.agentName || r.agentId}`);
      if (r.result?.summary) parts.push(`Summary: ${r.result.summary}`);
      if (r.result?.repositories) parts.push(`Repositories: ${JSON.stringify(r.result.repositories)}`);
      if (r.result?.competitors) parts.push(`Competitors: ${JSON.stringify(r.result.competitors)}`);
      if (r.result?.recommendations) parts.push(`Recommendations: ${JSON.stringify(r.result.recommendations)}`);
      parts.push('');
    }
  }

  parts.push('\nTransform the above into structured documentation. Only include fields where there is real substance to document.');
  return parts.join('\n');
}

async function run(project, options = {}) {
  const agentConfig = options.agentConfig || {};
  const transcript = options.transcript || '';
  const configured = llm.isConfigured(agentConfig);

  log.info('Starting document polishing', {
    configured,
    model: agentConfig.model || '(none)',
    projectName: project.name,
    transcriptLen: transcript.length,
  });

  if (!configured) {
    log.warn('LLM not configured, cannot polish');
    return {
      structuredResult: { error: 'LLM not configured. Set an API key to enable document structuring.' },
      confidence: 0,
      suggestedPatch: {},
    };
  }

  const phases = ['foundation', 'validation', 'feasibility', 'viability', 'goToMarket', 'execution', 'synthesis'];
  const hasFieldContent = phases.some(p => {
    const data = project[p];
    return data && typeof data === 'object' && Object.values(data).some(v => v && typeof v === 'string' && v.trim().length > 10);
  });
  const hasTranscript = transcript.trim().length > 50;

  if (!hasFieldContent && !hasTranscript) {
    log.info('No content to polish (no fields, no transcript)');
    return {
      structuredResult: { note: 'No content found to structure.' },
      confidence: 1,
      suggestedPatch: {},
    };
  }

  const systemPrompt = buildSystemPrompt();
  const userPrompt = buildUserPrompt(project, transcript);

  log.info('Sending to LLM', { systemLen: systemPrompt.length, userLen: userPrompt.length, hasTranscript });

  const raw = await llm.chat(agentConfig, [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt },
  ]);

  let parsed;
  try {
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : null;
  } catch (e) {
    log.error('Failed to parse LLM response as JSON', { error: e.message, preview: raw.slice(0, 300) });
    parsed = null;
  }

  if (!parsed) {
    log.warn('LLM response was not valid JSON');
    return {
      structuredResult: { note: 'LLM returned non-JSON response', raw: raw.slice(0, 3000) },
      confidence: 0.3,
      suggestedPatch: {},
    };
  }

  const patch = {};
  for (const phase of phases) {
    if (parsed[phase] && typeof parsed[phase] === 'object') {
      patch[phase] = {};
      for (const [k, v] of Object.entries(parsed[phase])) {
        if (v && typeof v === 'string' && v.trim()) patch[phase][k] = v;
      }
      if (Object.keys(patch[phase]).length === 0) delete patch[phase];
    }
  }
  if (parsed.elevatorPitch && typeof parsed.elevatorPitch === 'string') patch.elevatorPitch = parsed.elevatorPitch;
  if (parsed.snapshot && typeof parsed.snapshot === 'string') patch.snapshot = parsed.snapshot;
  if (parsed.name && typeof parsed.name === 'string' && parsed.name.trim()) patch.name = parsed.name;
  if (parsed.ideaConfidence != null && typeof parsed.ideaConfidence === 'number') patch.ideaConfidence = parsed.ideaConfidence;

  patch.lastStructuredAt = new Date().toISOString();

  const fieldCount = Object.keys(patch).filter(k => k !== 'lastStructuredAt').length;
  log.info('Document polishing complete', { fieldCount, patchKeys: Object.keys(patch) });

  return {
    structuredResult: { fieldsPolished: fieldCount, preview: parsed.elevatorPitch || parsed.snapshot || '' },
    confidence: 0.85,
    suggestedPatch: patch,
  };
}

module.exports = { run };
