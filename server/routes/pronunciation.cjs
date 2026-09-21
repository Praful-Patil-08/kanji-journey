'use strict';
const express = require('express');
const PronunciationAttempt = require('../models/PronunciationAttempt.cjs');
const { authSupabase } = require('../middleware/authSupabase.cjs');

const router = express.Router();

// GET /api/pronunciation/:userId?targetText=&limit=&cursor=
router.get('/:userId', authSupabase(), async (req, res) => {
  try {
    const { userId } = req.params;
    if (req.userId !== userId) return res.status(403).json({ error: 'Forbidden' });

    const limitParam = req.query.limit;
    const cursor = req.query.cursor ? String(req.query.cursor) : null;
    const targetText = req.query.targetText ? String(req.query.targetText) : null;

    const filter = { user_id: userId };
    if (targetText) filter.targetText = targetText;
    if (cursor) {
      const d = new Date(cursor);
      if (isNaN(d.getTime())) return res.status(400).json({ error: 'Invalid cursor' });
      filter.createdAt = { $lt: d };
    }

    const limit = Math.min(Math.max(parseInt(String(limitParam), 10) || 20, 1), 100);
    const rows = await PronunciationAttempt.find(filter).sort({ createdAt: -1 }).limit(limit + 1).lean();
    const hasMore = rows.length > limit;
    const data = hasMore ? rows.slice(0, limit) : rows;
    const nextCursor = hasMore ? data[data.length - 1].createdAt.toISOString() : null;

    // Also compute improvement per targetText if requested
    let improvement = null;
    if (targetText && data.length >= 2) {
      const first = data[data.length - 1].pronunciationScore;
      const last = data[0].pronunciationScore;
      improvement = last - first;
    } else if (data.length >= 2) {
      // overall improvement: last vs first
      improvement = data[0].pronunciationScore - data[data.length - 1].pronunciationScore;
    }

    return res.json({ data, nextCursor, hasMore, improvement });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// GET /api/pronunciation/:userId/stats?targetText=
router.get('/:userId/stats', authSupabase(), async (req, res) => {
  try {
    const { userId } = req.params;
    if (req.userId !== userId) return res.status(403).json({ error: 'Forbidden' });
    const targetText = req.query.targetText ? String(req.query.targetText) : null;
    const filter = { user_id: userId };
    if (targetText) filter.targetText = targetText;
    const rows = await PronunciationAttempt.find(filter).sort({ createdAt: 1 }).lean();
    if (rows.length === 0) return res.json({ count: 0, avgScore: 0, best: 0, worst: 0, improvement: 0, history: [] });
    const scores = rows.map(r => r.pronunciationScore);
    const avgScore = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
    const best = Math.max(...scores);
    const worst = Math.min(...scores);
    const improvement = scores[scores.length - 1] - scores[0];
    return res.json({
      count: rows.length,
      avgScore,
      best,
      worst,
      improvement,
      history: rows.map(r => ({ attemptNumber: r.attemptNumber, score: r.pronunciationScore, createdAt: r.createdAt, transcript: r.transcript })),
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

module.exports = router;
