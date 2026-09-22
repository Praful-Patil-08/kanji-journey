'use strict';
const express = require('express');
const Profile = require('../models/Profile.cjs');
const { authSupabase } = require('../middleware/authSupabase.cjs');

const router = express.Router();

// GET /api/profiles/:userId — returns profile, creating it if missing
router.get('/:userId', authSupabase(), async (req, res) => {
  try {
    const { userId } = req.params;

    // Users can only read their own profile
    if (req.userId !== userId) return res.status(403).json({ error: 'Forbidden' });

    let profile = await Profile.findOne({ user_id: userId }).lean();

    if (!profile) {
      // Auto-create on first visit (mirrors Supabase trigger behaviour)
      const doc = await Profile.create({ user_id: userId });
      profile = doc.toJSON();
    }

    return res.json(profile);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// PUT /api/profiles/:userId — update profile fields
router.put('/:userId', authSupabase(), async (req, res) => {
  try {
    const { userId } = req.params;
    if (req.userId !== userId) return res.status(403).json({ error: 'Forbidden' });

    // Only allow client to update non-economy fields; xp/streak/readiness are server-computed via completions/mastery
    const allowed = [
      'display_name', 'bio', 'avatar_url', 'current_level',
      'daily_goal_minutes',
      'exam_date', 'learning_path', 'onboarding_completed',
      'last_activity_date',
    ];
    const updates = {};
    for (const key of allowed) {
      if (key in req.body) updates[key] = req.body[key];
    }
    updates.updated_at = new Date().toISOString();

    const profile = await Profile.findOneAndUpdate(
      { user_id: userId },
      { $set: updates },
      { new: true, upsert: true, lean: true }
    );

    return res.json(profile);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

module.exports = router;
