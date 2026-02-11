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

module.exports = router;
