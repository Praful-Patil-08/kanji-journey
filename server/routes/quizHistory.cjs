'use strict';
const express = require('express');
const LessonProgress = require('../models/LessonProgress.cjs');
const { authSupabase } = require('../middleware/authSupabase.cjs');
const { getLessonById } = require('../data/lessonCatalog.cjs');

const router = express.Router();

// GET /api/quiz-history/:userId?limit=20&cursor=ISO
// Returns recent completed lesson records enriched with lesson title + skill_area.
// Supports cursor pagination via completed_at: ?cursor=ISO → { data, nextCursor, hasMore }
// Without cursor/limit, returns array for backward compat.
router.get('/:userId', authSupabase(), async (req, res) => {
  try {
    const { userId } = req.params;
    if (req.userId !== userId) return res.status(403).json({ error: 'Forbidden' });

    const limitParam = req.query.limit;
    const cursor = req.query.cursor ? String(req.query.cursor) : null;
    const hasPagination = limitParam !== undefined || cursor;

    if (hasPagination) {
      const limit = Math.min(Math.max(parseInt(String(limitParam), 10) || 20, 1), 100);
      if (cursor && isNaN(new Date(cursor).getTime())) {
        return res.status(400).json({ error: 'Invalid cursor (expected ISO date)' });
      }
      const filter = { user_id: userId, completed: true };
      if (cursor) filter.completed_at = { $lt: cursor };
      const rows = await LessonProgress.find(filter).sort({ completed_at: -1 }).limit(limit + 1).lean();
      const hasMore = rows.length > limit;
      const dataRows = hasMore ? rows.slice(0, limit) : rows;
      const nextCursor = hasMore ? dataRows[dataRows.length - 1].completed_at : null;
      const result = dataRows.map((row) => {
        const catalogRow = getLessonById(row.lesson_id);
        return {
          id:           row.id,
          created_at:   row.completed_at ?? row.created_at,
          type:         catalogRow?.skill_area ?? 'lesson',
          score:        row.quiz_score ?? 0,
          duration_sec: row.time_spent_sec ?? 0,
          lesson_id:    row.lesson_id,
          lessons:      catalogRow ? { title: catalogRow.title } : null,
        };
      });
      return res.json({ data: result, nextCursor, hasMore });
    }

    const limit = Math.min(parseInt(String(limitParam), 10) || 20, 100);
    const rows = await LessonProgress.find({ user_id: userId, completed: true })
      .sort({ completed_at: -1 })
      .limit(limit)
      .lean();

    const result = rows.map((row) => {
      const catalogRow = getLessonById(row.lesson_id);
      return {
        id:           row.id,
        created_at:   row.completed_at ?? row.created_at,
        type:         catalogRow?.skill_area ?? 'lesson',
        score:        row.quiz_score ?? 0,
        duration_sec: row.time_spent_sec ?? 0,
        lesson_id:    row.lesson_id,
        lessons:      catalogRow ? { title: catalogRow.title } : null,
      };
    });

    return res.json(result);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

module.exports = router;
