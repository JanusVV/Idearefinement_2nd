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

module.exports = router;
