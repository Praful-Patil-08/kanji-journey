'use strict';

const express = require('express');
const router = express.Router();
const { generateChatReply, getWordData, requiresContext, getStaticRoute } = require('../lib/gemini.cjs');
const { authSupabase } = require('../middleware/authSupabase.cjs');
const Profile = require('../models/Profile.cjs');
const PracticeAttempt = require('../models/PracticeAttempt.cjs');
const Flashcard = require('../models/Flashcard.cjs');
const { calculateMastery } = require('../services/mastery.cjs');
const { retrieveRelevantLessons, buildLearnerContext, buildScopedContext } = require('../services/rag.cjs');
const { connectDB } = require('../db.cjs');

/**
 * Enhanced chat endpoint with scoped RAG
 * POST /api/chat/enhanced
 * Body: { message, history?, currentPage?, currentLessonId?, currentTopic?, userId? }
 * Requires Authorization Bearer token; userId in body must match token if provided.
 */
router.post('/enhanced', authSupabase(), async (req, res) => {
  try {
    const { message, history = [], currentPage = null, currentLessonId = null, currentTopic = null, userId: bodyUserId } = req.body;

    const userId = req.userId; // verified
    if (bodyUserId && bodyUserId !== userId) {
      return res.status(403).json({ error: 'Forbidden: userId mismatch' });
    }

    const trimmed = (message || '').toString().trim();
    if (!trimmed) return res.status(400).json({ error: 'Message is required' });
    if (trimmed.length > 2000) return res.status(413).json({ error: 'Message too long' });

    // Static routes first (no DB needed, instant)
    const staticResponse = getStaticRoute(trimmed);
    if (staticResponse) {
      try {
        const db = await connectDB();
        await Promise.all([
          db.collection('chat_history').insertOne({ user_id: userId, message: trimmed, role: 'user', createdAt: new Date() }),
          db.collection('chat_history').insertOne({ user_id: userId, message: staticResponse, role: 'assistant', createdAt: new Date() }),
        ]);
      } catch {}
      return res.json({ reply: staticResponse, contextUsed: false, isStatic: true });
    }

    // ── Scoped retrieval — only relevant data, with limits ──────────────────
    const [profile, recentAttempts, dueCount] = await Promise.all([
      Profile.findOne({ user_id: userId }).lean().catch(() => null),
      PracticeAttempt.find({ user_id: userId }).sort({ createdAt: -1 }).limit(20).lean().catch(() => []),
      Flashcard.countDocuments({ user_id: userId, next_review_date: { $lte: new Date().toISOString().slice(0, 10) } }).catch(() => 0),
    ]);

    const mastery = calculateMastery(recentAttempts, new Date());

    const relevantLessons = retrieveRelevantLessons({
      message: trimmed,
      currentLessonId,
      currentTopic,
      level: profile?.current_level || 'N5',
      limit: 3,
    });

    const learnerContext = buildLearnerContext({
      mastery,
      recentAttempts,
      dueCount,
    });

    const { context: scopedContext, tokens, truncated } = buildScopedContext({
      profile,
      relevantLessons,
      learnerContext,
      currentPage,
      currentLessonId,
      currentTopic,
      maxTokens: 800,
    });

    // History: use client-provided plus limit to 8, truncate each
    const historyWindow = (Array.isArray(history) ? history : [])
      .filter(h => h.role === 'user' || h.role === 'assistant')
      .slice(-8)
      .map(h => ({ role: h.role === 'assistant' ? 'model' : 'user', content: (h.content || '').toString().slice(0, 800) }));

    // Decide if we need learner context at all
    const needsContext = requiresContext(trimmed) || !!currentTopic || !!currentLessonId || dueCount > 0 || (mastery?.weakTopics?.length ?? 0) > 0;
    const finalContext = needsContext ? scopedContext : null;

    const aiResponse = await generateChatReply(trimmed, historyWindow, finalContext);

    // Persist conversation (best-effort)
    try {
      const db = await connectDB();
      await Promise.all([
        db.collection('chat_history').insertOne({ user_id: userId, message: trimmed, role: 'user', createdAt: new Date() }),
        db.collection('chat_history').insertOne({ user_id: userId, message: aiResponse, role: 'assistant', createdAt: new Date() }),
      ]);
    } catch {}

    return res.json({
      reply: aiResponse,
      contextUsed: needsContext && !!finalContext,
      isStatic: false,
      retrieval: {
        lessonCount: relevantLessons.length,
        weakCount: mastery?.weakTopics?.length || 0,
        dueCount,
        tokens,
        truncated,
        currentPage,
        currentTopic,
      },
    });
  } catch (error) {
    console.error('Error in chat enhanced endpoint:', error);
    return res.status(500).json({ error: 'Failed to generate chat response', details: error.message });
  }
});

/**
 * Get conversation history for a user
 * GET /api/chat/history?limit=50
 * Requires auth, returns only own history
 */
router.get('/history', authSupabase(), async (req, res) => {
  try {
    const userId = req.userId;
    const limit = Math.min(parseInt(req.query.limit, 10) || 50, 100);
    const db = await connectDB();
    const collection = db.collection('chat_history');
    const messages = await collection.find({ user_id: userId }).sort({ createdAt: -1 }).limit(limit).toArray();
    const chronological = messages.reverse().map(msg => ({
      id: msg._id.toString(),
      role: msg.role,
      content: msg.message,
      timestamp: msg.createdAt,
    }));
    return res.json({ messages: chronological });
  } catch (error) {
    console.error('Error fetching chat history:', error);
    return res.status(500).json({ error: 'Failed to fetch chat history' });
  }
});

/**
 * Clear conversation history for a user
 * DELETE /api/chat/history
 */
router.delete('/history', authSupabase(), async (req, res) => {
  try {
    const userId = req.userId;
    const db = await connectDB();
    await db.collection('chat_history').deleteMany({ user_id: userId });
    return res.json({ success: true });
  } catch (error) {
    console.error('Error clearing chat history:', error);
    return res.status(500).json({ error: 'Failed to clear chat history' });
  }
});

module.exports = { chatRouter: router };
