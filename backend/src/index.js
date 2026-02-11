/**
 * IdeaRefinement backend: registry API, CORS, optional conductor/workers later.
 */

const express = require('express');
const cors = require('cors');
const projectsRouter = require('./routes/projects');
const workersRouter = require('./routes/workers');
const conductorPrompt = require('./prompts/conductor');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

app.use('/projects', projectsRouter);
app.use('/workers', workersRouter);

app.get('/prompts/conductor', (req, res) => {
  res.type('text/plain').send(conductorPrompt);
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'idearefinement-backend' });
});

app.listen(PORT, () => {
  console.log(`IdeaRefinement backend listening on port ${PORT}`);
});
