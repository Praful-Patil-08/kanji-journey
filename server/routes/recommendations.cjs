'use strict';
const express = require('express');
const PracticeAttempt = require('../models/PracticeAttempt.cjs');
const Flashcard = require('../models/Flashcard.cjs');
const Profile = require('../models/Profile.cjs');
const { authSupabase } = require('../middleware/authSupabase.cjs');
const { calculateMastery } = require('../services/mastery.cjs');
const { generateRecommendations } = require('../services/recommendation.cjs');

const router = express.Router();

// GET /api/recommendations/:userId
// Generates a personalized daily study session, considering:
// SRS due, weak topics, recent mistakes, decay, difficulty, JLPT level, session duration.
// Response: { session: { estimatedMinutes, items: [ { type, topic, reason, reasonDetail, estimatedMinutes, priority } ] } }
router.get('/:userId', authSupabase(), async (req, res) => {
  try {
    const { userId } = req.params;
    if (req.userId !== userId) return res.status(403).json({ error: 'Forbidden' });

    const [profile, attempts, dueCards] = await Promise.all([
      Profile.findOne({ user_id: userId }).lean(),
      PracticeAttempt.find({ user_id: userId }).sort({ createdAt: -1 }).limit(500).lean(),
      Flashcard.countDocuments({ user_id: userId, next_review_date: { $lte: new Date().toISOString().slice(0, 10) } }),
    ]);

    const mastery = calculateMastery(attempts, new Date());

    const result = generateRecommendations({
      dueCount: dueCards,
      mastery,
      profile: profile || { current_level: 'N5', daily_goal_minutes: 15 },
      now: new Date(),
    });

    return res.json(result);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

module.exports = router;
