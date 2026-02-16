/**
 * PRD-lite worker: generates a short product requirements summary from project snapshot.
 * Returns a suggested registry patch (buildPlan, optional backlog).
 */

function run(project) {
  const snapshot = project.snapshot || '';
  const mvp = project.mvp || '';
  const track = project.track || 'Personal';
  const phase = project.phase || 1;

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
`;

  return {
    structuredResult: { prdLite, generatedAt: new Date().toISOString() },
    confidence: 0.8,
    suggestedPatch: {
      buildPlan: prdLite,
      snapshot: project.snapshot,
      mvp: project.mvp,
    },
  };
}

module.exports = { run };
