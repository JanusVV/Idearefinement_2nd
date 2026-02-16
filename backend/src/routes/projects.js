/**
 * Registry API: GET /projects, GET /projects/:id, POST /projects, PATCH /projects/:id
 */

const express = require('express');
const registry = require('../registry');

const router = express.Router();

router.get('/', (req, res) => {
  try {
    const projects = registry.list();
    res.json(projects);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/:id', (req, res) => {
  const project = registry.load(req.params.id);
  if (!project) return res.status(404).json({ error: 'Project not found' });
  res.json(project);
});

router.post('/', (req, res) => {
  try {
    const project = registry.create(req.body);
    res.status(201).json(project);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.patch('/:id', (req, res) => {
  const project = registry.load(req.params.id);
  if (!project) return res.status(404).json({ error: 'Project not found' });
  try {
    const updated = registry.applyPatch(project, { ...req.body, projectId: project.projectId });
    registry.save(updated);
    res.json(updated);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── Refinement history endpoints ────────────────────────────────────

router.get('/:id/refinements', (req, res) => {
  const project = registry.load(req.params.id);
  if (!project) return res.status(404).json({ error: 'Project not found' });
  const refinements = Array.isArray(project.refinements) ? project.refinements : [];
  res.json(refinements);
});

router.post('/:id/refinements', (req, res) => {
  const project = registry.load(req.params.id);
  if (!project) return res.status(404).json({ error: 'Project not found' });
  const { summary, source } = req.body || {};
  if (!summary || typeof summary !== 'string' || !summary.trim()) {
    return res.status(400).json({ error: 'summary is required' });
  }
  try {
    const entry = registry.addRefinement(project, { summary: summary.trim(), source });
    registry.save(project);
    res.status(201).json(entry);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/:id/refinements/download', (req, res) => {
  const project = registry.load(req.params.id);
  if (!project) return res.status(404).json({ error: 'Project not found' });
  try {
    const md = registry.refinementsToMarkdown(project);
    const safeName = (project.name || 'idea').replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 60);
    res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="refinements-${safeName}.md"`);
    res.send(md);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── Structure / polish via LLM ───────────────────────────────────────

router.post('/:id/structure', async (req, res) => {
  const project = registry.load(req.params.id);
  if (!project) return res.status(404).json({ error: 'Project not found' });
  try {
    const agents = require('../agents');
    const agent = agents.get('documentPolisher');
    if (!agent) return res.status(500).json({ error: 'documentPolisher agent not registered' });

    const transcript = (req.body && req.body.transcript) || '';
    const worker = require('../workers/documentPolisher');
    const result = await worker.run(project, { agentConfig: agent.config || {}, transcript });

    if (result.suggestedPatch && Object.keys(result.suggestedPatch).length > 0) {
      const patch = { ...result.suggestedPatch, _refinementNote: 'Structured by Document Polisher', _refinementSource: 'worker' };
      const updated = registry.applyPatch(project, patch);
      registry.save(updated);
      return res.json(updated);
    }
    res.json(project);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── Full refined idea export ─────────────────────────────────────────

router.get('/:id/export', async (req, res) => {
  let project = registry.load(req.params.id);
  if (!project) return res.status(404).json({ error: 'Project not found' });
  try {
    const skipPolish = req.query.raw === 'true';
    if (!skipPolish && !project.lastStructuredAt) {
      const hasRawContent = ['foundation', 'validation', 'feasibility', 'viability', 'goToMarket', 'execution', 'synthesis']
        .some(p => {
          const d = project[p];
          return d && typeof d === 'object' && Object.values(d).some(v => v && typeof v === 'string' && v.trim().length > 20 && !v.includes('**'));
        });
      if (hasRawContent) {
        try {
          const agents = require('../agents');
          const agent = agents.get('documentPolisher');
          if (agent) {
            const worker = require('../workers/documentPolisher');
            const result = await worker.run(project, { agentConfig: agent.config || {} });
            if (result.suggestedPatch && Object.keys(result.suggestedPatch).length > 0) {
              const patch = { ...result.suggestedPatch, _refinementNote: 'Auto-structured at export', _refinementSource: 'worker' };
              project = registry.applyPatch(project, patch);
              registry.save(project);
            }
          }
        } catch (polishErr) {
          /* Log but don't fail the export */
          console.error('Auto-polish at export failed:', polishErr.message);
        }
      }
    }
    const md = registry.projectToMarkdown(project);
    const safeName = (project.name || 'idea').replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 60);
    res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="REFINED_IDEA_${safeName}.md"`);
    res.send(md);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
