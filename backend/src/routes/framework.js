/**
 * Framework API: GET /framework (view), PUT /framework (edit).
 * Body for PUT: raw text (Content-Type text/plain or application/json with "content" key).
 */

const express = require('express');
const framework = require('../framework');

const router = express.Router();

router.get('/', (req, res) => {
  try {
    const content = framework.read();
    res.type('text/plain').send(content);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.put('/', (req, res) => {
  try {
    let content;
    if (typeof req.body === 'string') {
      content = req.body;
    } else if (req.body && typeof req.body.content === 'string') {
      content = req.body.content;
    } else {
      return res.status(400).json({ error: 'Send framework as text/plain or JSON { "content": "..." }' });
    }
    framework.write(content);
    res.type('text/plain').send(content);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
