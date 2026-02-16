/**
 * Agents API: list/create/update/delete configurable agents; create task and list task results.
 */

const express = require('express');
const agents = require('../agents');
const agentTasks = require('../agentTasks');

const router = express.Router();

router.get('/', (req, res) => {
  try {
    const list = agents.list();
    res.json(list);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/:id', (req, res) => {
  const agent = agents.get(req.params.id);
  if (!agent) return res.status(404).json({ error: 'Agent not found' });
  res.json(agent);
});

router.post('/', (req, res) => {
  try {
    const agent = agents.create(req.body);
    res.status(201).json(agent);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

router.patch('/:id', (req, res) => {
  const updated = agents.update(req.params.id, req.body);
  if (!updated) return res.status(404).json({ error: 'Agent not found' });
  res.json(updated);
});

router.delete('/:id', (req, res) => {
  const removed = agents.remove(req.params.id);
  if (!removed) return res.status(404).json({ error: 'Agent not found' });
  res.status(204).send();
});

router.post('/tasks', (req, res) => {
  const { projectId, agentId, taskDescription } = req.body || {};
  if (!projectId || !agentId) return res.status(400).json({ error: 'projectId and agentId required' });
  try {
    const out = agentTasks.createAndRun(projectId, agentId, taskDescription);
    res.status(202).json(out);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

router.get('/tasks/list', (req, res) => {
  const { projectId, status, since } = req.query;
  try {
    const list = agentTasks.listTasks(projectId, { status, since });
    res.json(list);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/tasks/:taskId', (req, res) => {
  const task = agentTasks.getTask(req.params.taskId);
  if (!task) return res.status(404).json({ error: 'Task not found' });
  res.json(task);
});

module.exports = router;
