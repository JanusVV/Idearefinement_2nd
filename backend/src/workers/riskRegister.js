/**
 * Risk register worker: suggests initial risks from project snapshot/track/rigor.
 * Returns a suggested registry patch with risks array and optional note.
 */

function run(project) {
  const snapshot = (project.snapshot || '').slice(0, 300);
  const track = project.track || 'Personal';
  const rigor = project.rigor || 'Light';
  const existingRisks = project.risks || [];

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
  const risks = existingRisks.length ? existingRisks : defaultRisks;
  if (newRisks.length && existingRisks.length) {
    risks.push(...newRisks);
  }

  return {
    structuredResult: { risks, note: 'Initial risk register. Refine with conductor or manually.' },
    confidence: 0.7,
    suggestedPatch: { risks, snapshot: project.snapshot },
  };
}

module.exports = { run };
