/**
 * Light competitor scan worker: placeholder that returns a minimal competitor/market note.
 * Can be extended to call an LLM (OpenAI/Claude) for real competitor research.
 */

function run(project) {
  const snapshot = (project.snapshot || '').slice(0, 200);
  const track = project.track || 'Personal';

  if (track === 'Personal') {
    return {
      structuredResult: { note: 'Competitor scan skipped for Personal track.', competitors: [] },
      confidence: 1,
      suggestedPatch: { snapshot: project.snapshot },
    };
  }

  const note = `Light market check for: "${snapshot}". Consider searching for 3–5 direct alternatives and one-sentence positioning.`;
  return {
    structuredResult: {
      note,
      competitors: [],
      suggestedNextStep: 'Run a full competitor scan (e.g. via worker with LLM) when ready.',
    },
    confidence: 0.5,
    suggestedPatch: {
      validationPlan: (project.validationPlan || '') + '\n- [ ] Light competitor scan done.',
      snapshot: project.snapshot,
    },
  };
}

module.exports = { run };
