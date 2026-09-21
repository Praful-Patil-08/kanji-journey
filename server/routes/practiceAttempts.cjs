'use strict';
const express = require('express');
const { z } = require('zod');
const PracticeAttempt = require('../models/PracticeAttempt.cjs');
const { authSupabase } = require('../middleware/authSupabase.cjs');

const router = express.Router();

// ── Validation ──────────────────────────────────────────────────────────────
const createSchema = z.object({
  user_id:         z.string().min(1),
  questionId:      z.string().min(1),
  topic:           z.string().min(1).max(64),
  section:         z.string().max(64).nullable().optional(),
  selectedAnswer:  z.string().min(1).max(500),
  correctAnswer:   z.string().min(1).max(500),
  isCorrect:       z.boolean(),
  responseTimeMs:  z.number().int().min(0).max(600000).nullable().optional(),
  difficulty:      z.enum(['easy','medium','hard']).nullable().optional(),
  level:           z.string().max(8).optional(),
});

const batchSchema = z.object({
  attempts: z.array(createSchema).min(1).max(50),
});

// ── POST /api/practice-attempts — single attempt ──────────────────────────
router.post('/', authSupabase(), async (req, res) => {
  try {
    const parsed = createSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten() });
    }
    const data = parsed.data;

    if (req.userId !== data.user_id) return res.status(403).json({ error: 'Forbidden' });

    const doc = await PracticeAttempt.create({
      id:             crypto.randomUUID(),
      user_id:        data.user_id,
      questionId:     data.questionId,
      topic:          data.topic,
      section:        data.section ?? null,
      selectedAnswer: data.selectedAnswer,
      correctAnswer:  data.correctAnswer,
      isCorrect:      data.isCorrect,
      responseTimeMs: data.responseTimeMs ?? null,
      difficulty:     data.difficulty ?? null,
      level:          data.level ?? 'N5',
      createdAt:      new Date(),
    });

    return res.status(201).json(doc.toJSON());
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// ── POST /api/practice-attempts/batch — batch insert (up to 50) ───────────
// Used when submitting a full quiz/practice session at once.
router.post('/batch', authSupabase(), async (req, res) => {
  try {
    const parsed = batchSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten() });
    }

    // All attempts must belong to authenticated user
    const forbidden = parsed.data.attempts.find(a => a.user_id !== req.userId);
    if (forbidden) return res.status(403).json({ error: 'Forbidden: user_id mismatch' });

    const docs = parsed.data.attempts.map(a => ({
      id:             crypto.randomUUID(),
      user_id:        a.user_id,
      questionId:     a.questionId,
      topic:          a.topic,
      section:        a.section ?? null,
      selectedAnswer: a.selectedAnswer,
      correctAnswer:  a.correctAnswer,
      isCorrect:      a.isCorrect,
      responseTimeMs: a.responseTimeMs ?? null,
      difficulty:     a.difficulty ?? null,
      level:          a.level ?? 'N5',
      createdAt:      new Date(),
    }));

    const inserted = await PracticeAttempt.insertMany(docs, { ordered: false });
    return res.status(201).json({ inserted: inserted.length, ids: inserted.map(d => d.id) });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// ── GET /api/practice-attempts/:userId ────────────────────────────────────
// Supports: ?topic= & ?limit= & ?cursor= (ISO date string) & ?questionId=
// Cursor-based pagination using createdAt (desc). No offset scan.
router.get('/:userId', authSupabase(), async (req, res) => {
  try {
    const { userId } = req.params;
    if (req.userId !== userId) return res.status(403).json({ error: 'Forbidden' });

    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 20, 1), 100);
    const topic = req.query.topic ? String(req.query.topic) : null;
    const questionId = req.query.questionId ? String(req.query.questionId) : null;
    const cursor = req.query.cursor ? new Date(String(req.query.cursor)) : null;
    if (req.query.cursor && isNaN(cursor.getTime())) {
      return res.status(400).json({ error: 'Invalid cursor (expected ISO date)' });
    }

    const filter = { user_id: userId };
    if (topic) filter.topic = topic;
    if (questionId) filter.questionId = questionId;
    if (cursor) filter.createdAt = { $lt: cursor };

    const rows = await PracticeAttempt.find(filter)
      .sort({ createdAt: -1 })
      .limit(limit + 1) // fetch one extra to detect hasMore
      .lean();

    const hasMore = rows.length > limit;
    const data = hasMore ? rows.slice(0, limit) : rows;
    const nextCursor = hasMore ? data[data.length - 1].createdAt.toISOString() : null;

    return res.json({ data, nextCursor, hasMore });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

module.exports = router;
