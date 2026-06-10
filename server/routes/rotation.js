const express = require('express');
const router = express.Router();
const core = require('../lib/rotation');

// GET /api/family-rotation
router.get('/', (req, res) => {
  res.json(core.getRotationState(req.app.locals.db, req.app.locals.familyConfig.rotation));
});

// POST /api/family-rotation/skip — skip current person's turn
router.post('/skip', (req, res) => {
  const db = req.app.locals.db;
  const rotation = req.app.locals.familyConfig.rotation;
  core.advanceRotation(db, rotation);
  res.json(core.getRotationState(db, rotation));
});

// DELETE /api/family-rotation/skip — undo a skip (go back one)
router.delete('/skip', (req, res) => {
  const db = req.app.locals.db;
  const rotation = req.app.locals.familyConfig.rotation;
  core.rewindRotation(db, rotation);
  res.json(core.getRotationState(db, rotation));
});

module.exports = { router };
