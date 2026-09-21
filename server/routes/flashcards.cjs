'use strict';
const express = require('express');
const Flashcard = require('../models/Flashcard.cjs');
const FlashcardReview = require('../models/FlashcardReview.cjs');
const PracticeAttempt = require('../models/PracticeAttempt.cjs');
const { authSupabase } = require('../middleware/authSupabase.cjs');
const { sm2Review } = require('../services/srs.cjs');
const { getLessonById } = require('../data/lessonCatalog.cjs');

const router = express.Router();

// GET /api/flashcards/:userId — all flashcards for a user
// Supports cursor pagination: ?limit=20&cursor=ISO (created_at) → { data, nextCursor, hasMore }
// Without pagination params, returns array for backward compat
router.get('/:userId', authSupabase(), async (req, res) => {
  try {
    const { userId } = req.params;
    if (req.userId !== userId) return res.status(403).json({ error: 'Forbidden' });

    const limitParam = req.query.limit;
    const cursor = req.query.cursor ? String(req.query.cursor) : null;

    // If pagination requested, use cursor pagination
    if (limitParam !== undefined || cursor) {
      const limit = Math.min(Math.max(parseInt(String(limitParam), 10) || 20, 1), 100);
      if (cursor && isNaN(new Date(cursor).getTime())) {
        return res.status(400).json({ error: 'Invalid cursor (expected ISO date)' });
      }
      const filter = { user_id: userId };
      if (cursor) filter.created_at = { $lt: cursor };
      const rows = await Flashcard.find(filter).sort({ created_at: -1 }).limit(limit + 1).lean();
      const hasMore = rows.length > limit;
      const data = hasMore ? rows.slice(0, limit) : rows;
      const nextCursor = hasMore ? data[data.length - 1].created_at : null;
      return res.json({ data, nextCursor, hasMore });
    }

    const cards = await Flashcard.find({ user_id: userId }).sort({ created_at: -1 }).lean();
    return res.json(cards);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// GET /api/flashcards/:userId/due?collectionId=&limit=&cursor= — cards due for review today
// Supports cursor pagination via created_at (with due filter)
router.get('/:userId/due', authSupabase(), async (req, res) => {
  try {
    const { userId } = req.params;
    if (req.userId !== userId) return res.status(403).json({ error: 'Forbidden' });

    const today = new Date().toISOString().slice(0, 10);
    const limitParam = req.query.limit;
    const cursor = req.query.cursor ? String(req.query.cursor) : null;

    const filter = { user_id: userId, next_review_date: { $lte: today } };

    if (limitParam !== undefined || cursor) {
      const limit = Math.min(Math.max(parseInt(String(limitParam), 10) || 20, 1), 100);
      if (cursor && isNaN(new Date(cursor).getTime())) {
        return res.status(400).json({ error: 'Invalid cursor (expected ISO date)' });
      }
      if (cursor) filter.created_at = { $lt: cursor };
      const rows = await Flashcard.find(filter).sort({ created_at: -1 }).limit(limit + 1).lean();
      const hasMore = rows.length > limit;
      const data = hasMore ? rows.slice(0, limit) : rows;
      const nextCursor = hasMore ? data[data.length - 1].created_at : null;
      return res.json({ data, nextCursor, hasMore });
    }

    const cards = await Flashcard.find(filter).sort({ next_review_date: 1 }).lean();
    return res.json(cards);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// POST /api/flashcards — create a new flashcard (upsert by front to prevent duplicates)
router.post('/', authSupabase(), async (req, res) => {
  try {
    const { user_id, lesson_id, front, back, next_review_date, review_state } = req.body;
    if (req.userId !== user_id) return res.status(403).json({ error: 'Forbidden' });
    if (!user_id || !front || !back) return res.status(400).json({ error: 'user_id, front and back are required' });

    const today = new Date().toISOString().slice(0, 10);

    const card = await Flashcard.findOneAndUpdate(
      { user_id, front },
      {
        $setOnInsert: {
          id:               crypto.randomUUID(),
          user_id,
          lesson_id:        lesson_id ?? null,
          front,
          back,
          review_state:     review_state ?? 'new',
          ease_factor:      2.5,
          interval_days:    1,
          next_review_date: next_review_date ?? today,
          reviews_total:    0,
          reviews_correct:  0,
          created_at:       new Date().toISOString(),
          updated_at:       new Date().toISOString(),
        },
      },
      { new: true, upsert: true, lean: true }
    );

    return res.status(201).json(card);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// POST /api/flashcards/:cardId/review — SM-2 review
router.post('/:cardId/review', authSupabase(), async (req, res) => {
  try {
    const { cardId } = req.params;
    const { grade } = req.body;

    if (grade === undefined || grade < 0 || grade > 5) {
      return res.status(400).json({ error: 'grade must be 0–5' });
    }

    const existing = await Flashcard.findOne({ id: cardId }).lean();
    if (!existing) return res.status(404).json({ error: 'Flashcard not found' });
    if (req.userId !== existing.user_id) return res.status(403).json({ error: 'Forbidden' });

    const updates = sm2Review(existing, grade);

    const updated = await Flashcard.findOneAndUpdate(
      { id: cardId },
      { $set: updates },
      { new: true, lean: true }
    );

    // ── Persist review history (for analytics, not just counters) ───────────
    try {
      await FlashcardReview.create({
        id: crypto.randomUUID(),
        user_id: existing.user_id,
        card_id: cardId,
        grade,
        ease_before: existing.ease_factor ?? 2.5,
        ease_after: updates.ease_factor,
        interval_before: existing.interval_days ?? 1,
        interval_after: updates.interval_days,
        review_state_before: existing.review_state,
        review_state_after: updates.review_state,
        createdAt: new Date(),
      });
    } catch (e) {
      console.error('[FlashcardReview] failed to persist:', e.message);
    }

    // ── Feed mastery/recommendations via PracticeAttempt ────────────────────
    // Map flashcard to a practice topic so SRS reviews contribute to mastery.
    // Use lesson_id → skill_area if available, otherwise generic 'kanji'.
    try {
      const catalog = existing.lesson_id ? getLessonById(existing.lesson_id) : null;
      const topic = catalog?.skill_area || 'kanji';
      const section = catalog?.skill_area || topic;
      await PracticeAttempt.create({
        id: crypto.randomUUID(),
        user_id: existing.user_id,
        questionId: `flashcard:${cardId}`,
        topic,
        section,
        selectedAnswer: String(grade),
        correctAnswer: grade >= 3 ? String(grade) : 'review',
        isCorrect: grade >= 3,
        responseTimeMs: null,
        difficulty: grade <= 1 ? 'hard' : grade === 5 ? 'easy' : 'medium',
        level: catalog?.level || 'N5',
        createdAt: new Date(),
      });
    } catch (e) {
      console.error('[Flashcard→PracticeAttempt] feed failed:', e.message);
    }

    return res.json(updated);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// GET /api/flashcards/:cardId/history — review history for a card (owner only)
router.get('/:cardId/history', authSupabase(), async (req, res) => {
  try {
    const { cardId } = req.params;
    const card = await Flashcard.findOne({ id: cardId }).lean();
    if (!card) return res.status(404).json({ error: 'Flashcard not found' });
    if (req.userId !== card.user_id) return res.status(403).json({ error: 'Forbidden' });

    const history = await FlashcardReview.find({ card_id: cardId }).sort({ createdAt: -1 }).limit(50).lean();
    return res.json(history);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

module.exports = router;
