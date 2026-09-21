'use strict';
const express = require('express');
const PracticeAttempt = require('../models/PracticeAttempt.cjs');
const { authSupabase } = require('../middleware/authSupabase.cjs');
const { calculateMastery } = require('../services/mastery.cjs');

const router = express.Router();

// GET /api/mastery/:userId?topic=&section=&limit=200
// Returns deterministic mastery per topic/section + weak topics + overall.
// Requires ownership (req.userId must match param).
router.get('/:userId', authSupabase(), async (req, res) => {
  try {
    const { userId } = req.params;
    if (req.userId !== userId) return res.status(403).json({ error: 'Forbidden' });

    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 200, 1), 1000);
    const topicFilter = req.query.topic ? String(req.query.topic) : null;
    const sectionFilter = req.query.section ? String(req.query.section) : null;

    const filter = { user_id: userId };
    if (topicFilter) filter.topic = topicFilter;
    if (sectionFilter) filter.section = sectionFilter;

    // Fetch up to 1000 most recent attempts for the user (covers ~months of practice)
    const attempts = await PracticeAttempt.find(filter)
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();

    // calculateMastery expects attempts with isCorrect, responseTimeMs, createdAt, topic, section
    const result = calculateMastery(attempts, new Date());

    return res.json(result);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

module.exports = router;
