/**
 * IdeaRefinement backend: registry API, CORS, optional conductor/workers later.
 */

const express = require('express');
const cors = require('cors');
const { createScopedLogger } = require('./logger');
const frameworkRouter = require('./routes/framework');
const projectsRouter = require('./routes/projects');
const workersRouter = require('./routes/workers');
const agentsRouter = require('./routes/agents');
const conductorPrompt = require('./prompts/conductor');
const framework = require('./framework');

const log = createScopedLogger('Server');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.text({ type: 'text/plain' }));

app.use('/projects', projectsRouter);
app.use('/workers', workersRouter);
app.use('/agents', agentsRouter);
app.use('/framework', frameworkRouter);

app.get('/prompts/conductor', (req, res) => {
  const basePrompt = conductorPrompt;
  const frameworkContent = framework.read();
  const withFramework = frameworkContent
    ? basePrompt + '\n\n--- REFINEMENT FRAMEWORK (phases, modules, triggers) ---\nUse this to guide which phases and modules to suggest. Only activate modules when track/rigor or user request triggers them.\n\n' + frameworkContent
    : basePrompt;
  res.type('text/plain').send(withFramework);
});
app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'idearefinement-backend' });
});

app.listen(PORT, () => {
  log.info(`Backend listening on port ${PORT}`);
});
