/**
 * POST /workers/:jobType — run a worker for the given project, return result + suggested patch.
 * Body: { projectId }. Project is loaded from registry; worker runs and returns suggestedPatch.
 */

const express = require('express');
const registry = require('../registry');

const workers = {
  prdLite: require('../workers/prdLite'),
  competitorScan: require('../workers/competitorScan'),
};

const router = express.Router();

router.post('/:jobType', (req, res) => {
  const jobType = req.params.jobType;
  const { projectId, apply } = req.body || {};

  if (!projectId) return res.status(400).json({ error: 'projectId required' });
  const worker = workers[jobType];
  if (!worker) return res.status(404).json({ error: 'Unknown job type: ' + jobType });

  let project = registry.load(projectId);
  if (!project) return res.status(404).json({ error: 'Project not found' });

  try {
    const result = worker.run(project);
    if (apply && result.suggestedPatch) {
      project = registry.applyPatch(project, { ...result.suggestedPatch, projectId: project.projectId });
      registry.save(project);
      return res.json({ ...result, project });
    }
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
