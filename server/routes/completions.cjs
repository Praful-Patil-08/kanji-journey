'use strict';
const express = require('express');
const { z } = require('zod');
const Profile = require('../models/Profile.cjs');
const Flashcard = require('../models/Flashcard.cjs');
const LessonProgress = require('../models/LessonProgress.cjs');
const { authSupabase } = require('../middleware/authSupabase.cjs');
const { getLessonById } = require('../data/lessonCatalog.cjs');

const completionsSchema = z.object({
  userId: z.string().min(1),
  lessonId: z.string().min(1).max(50).optional().nullable(),
  answers: z.array(z.object({
    question: z.string().min(1).max(500),
    correct_answer: z.string().min(1).max(500),
    is_correct: z.boolean(),
  })).max(50).optional().default([]),
  score: z.number().min(0).max(100).optional().default(0),
  timeSpentSec: z.number().min(0).max(86400).optional().default(0),
  level: z.enum(['N5','N4','N3','N2','N1']).optional().default('N5'),
});

const router = express.Router();

// POST /api/complete-lesson
// Equivalent to the Supabase complete_lesson(p_user_id, p_answers, p_score) RPC.
// Body: { userId, lessonId, answers: [{ question, correct_answer, is_correct }], score, timeSpentSec, level }
router.post('/', authSupabase(), async (req, res) => {
  try {
    const parsed = completionsSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten() });
    }
    const { userId, lessonId, answers, score, timeSpentSec, level } = parsed.data;

    if (req.userId !== userId) return res.status(403).json({ error: 'Forbidden' });

    // ── 1. XP + streak ────────────────────────────────────────────────────────
    const xpGain = Math.min(50 + score, 150);

    const profile = await Profile.findOne({ user_id: userId }).lean();
    if (!profile) return res.status(404).json({ error: 'Profile not found' });

    const today = new Date().toISOString().slice(0, 10);
    const lastDate = profile.last_activity_date;

    let newStreak;
    if (!lastDate) {
      newStreak = 1;
    } else {
      const diffMs   = new Date(today) - new Date(lastDate);
      const diffDays = Math.round(diffMs / 86_400_000);
      if (diffDays === 0)      newStreak = profile.streak;           // same day
      else if (diffDays === 1) newStreak = (profile.streak ?? 0) + 1; // consecutive
      else                     newStreak = 1;                         // missed a day
    }

    const newXp = (profile.xp ?? 0) + xpGain;

    await Profile.updateOne(
      { user_id: userId },
      { $set: { xp: newXp, streak: newStreak, last_activity_date: today, updated_at: new Date().toISOString() } }
    );

    // ── 2. SRS flashcards for wrong answers ───────────────────────────────────
    const wrongAnswers = (answers ?? []).filter((a) => !a.is_correct && a.question);
    if (wrongAnswers.length > 0) {
      const cardOps = wrongAnswers.map((a) => ({
        updateOne: {
          filter: { user_id: userId, front: a.question },
          update: {
            $setOnInsert: {
              id:               crypto.randomUUID(),
              user_id:          userId,
              lesson_id:        lessonId ?? null,
              front:            a.question,
              back:             a.correct_answer ?? '',
              review_state:     'new',
              ease_factor:      2.5,
              interval_days:    1,
              next_review_date: today,
              reviews_total:    0,
              reviews_correct:  0,
              created_at:       new Date().toISOString(),
              updated_at:       new Date().toISOString(),
            },
          },
          upsert: true,
        },
      }));
      await Flashcard.bulkWrite(cardOps);
    }

    // ── 3. Lesson progress ────────────────────────────────────────────────────
    if (lessonId) {
      const catalogRow = getLessonById(lessonId);
      await LessonProgress.findOneAndUpdate(
        { user_id: userId, lesson_id: lessonId },
        {
          $set: {
            level:          catalogRow?.level  ?? level,
            week_number:    catalogRow?.week_number ?? 1,
            completed:      true,
            completed_at:   new Date().toISOString(),
            quiz_score:     score,
            time_spent_sec: timeSpentSec,
          },
          $setOnInsert: {
            id:         crypto.randomUUID(),
            created_at: new Date().toISOString(),
          },
        },
        { upsert: true }
      );
    }

    return res.json({ xp_gain: xpGain, new_xp: newXp, new_streak: newStreak });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

module.exports = router;
