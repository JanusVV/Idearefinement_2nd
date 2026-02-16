/**
 * POST /workers/:jobType — run a worker for the given project, return result + suggested patch.
 * Body: { projectId }. Project is loaded from registry; worker runs and returns suggestedPatch.
 */

const express = require('express');
const registry = require('../registry');

const workers = {
  prdLite: require('../workers/prdLite'),
  competitorScan: require('../workers/competitorScan'),
  riskRegister: require('../workers/riskRegister'),
  ossDiscovery: require('../workers/ossDiscovery'),
};

const router = express.Router();

router.post('/:jobType', async (req, res) => {
  const jobType = req.params.jobType;
  const { projectId, apply } = req.body || {};

  if (!projectId) return res.status(400).json({ error: 'projectId required' });
  const worker = workers[jobType];
  if (!worker) return res.status(404).json({ error: 'Unknown job type: ' + jobType });

  let project = registry.load(projectId);
  if (!project) return res.status(404).json({ error: 'Project not found' });

  try {
    const result = await worker.run(project);
    if (apply && result.suggestedPatch) {
      const workerPatch = {
        ...result.suggestedPatch,
        projectId: project.projectId,
        _refinementSource: 'worker',
        _refinementNote: `Worker "${jobType}" completed` + (result.confidence ? ` (confidence: ${result.confidence})` : ''),
      };
      project = registry.applyPatch(project, workerPatch);
      registry.save(project);
      return res.json({ ...result, project });
    }
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
