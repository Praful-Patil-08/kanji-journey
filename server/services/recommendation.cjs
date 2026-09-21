'use strict';

/**
 * Adaptive Recommendation Engine — deterministic, explainable, no LLM.
 *
 * Inputs (all deterministic, testable):
 *  - SRS cards due for review (count)
 *  - Weak topics (from mastery engine)
 *  - Recent mistakes / mistake frequency (from mastery)
 *  - Recent accuracy (per-topic)
 *  - Time since last practice (decay)
 *  - Difficulty (avgResponseTime, difficulty distribution)
 *  - User JLPT level (profile.current_level)
 *  - Topic mastery (mastery.byTopic)
 *  - Session duration (profile.daily_goal_minutes)
 *
 * Output: { session: { estimatedMinutes, items: [ { type, topic, reason, reasonDetail, estimatedMinutes, priority } ] } }
 * Every item has a human-readable reasonDetail for interview explainability.
 */

const MAX_ITEMS = 5;
const FLASHCARD_MINUTES_PER_3_CARDS = 2; // ~1.5 min per 3 cards
const QUIZ_MINUTES_PER_TOPIC = 4;
const REVIEW_MINUTES = 3;

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

/**
 * Pure function — deterministic.
 * @param {Object} params
 * @param {number} params.dueCount - number of flashcards due today
 * @param {Object} params.mastery - result of calculateMastery()
 * @param {Object} params.profile - { current_level: 'N5'|'N4'..., daily_goal_minutes: number }
 * @param {Date} params.now - for determinism (not used currently but kept for future decay)
 * @returns {{ session: { estimatedMinutes: number, items: Array }}}
 */
function generateRecommendations({ dueCount = 0, mastery = null, profile = {}, now = new Date() } = {}) {
  const dailyGoal = clamp(profile.daily_goal_minutes || 15, 5, 60);
  const items = [];
  let remaining = dailyGoal;

  const weakTopics = mastery?.weakTopics || [];
  const byTopic = mastery?.byTopic || {};
  const overall = mastery?.overall || { mastery: 0, accuracy: 0 };

  // ── 1. SRS due (highest priority, retention is foundation) ──────────────
  if (dueCount > 0) {
    const est = clamp(Math.ceil(dueCount / 3) * FLASHCARD_MINUTES_PER_3_CARDS, 3, 8);
    const minutes = Math.min(est, remaining);
    items.push({
      type: 'flashcard',
      topic: null,
      section: null,
      reason: 'due',
      reasonDetail: `${dueCount} card${dueCount === 1 ? '' : 's'} due for review — spaced repetition prevents forgetting.`,
      estimatedMinutes: minutes,
      priority: 1,
      dueCount,
    });
    remaining -= minutes;
  }

  // ── 2. Weak topics (mastery <60 or accuracy <65) ─────────────────────────
  for (const wt of weakTopics) {
    if (remaining <= 0 || items.length >= MAX_ITEMS) break;
    if (items.some(i => i.topic === wt.topic)) continue;
    const minutes = Math.min(QUIZ_MINUTES_PER_TOPIC, remaining);
    // Include difficulty context if available via avgResponseTime (slow → suggest focused drill)
    const stats = byTopic[wt.topic];
    const slowHint = stats?.avgResponseTimeMs && stats.avgResponseTimeMs > 3500
      ? ` Avg response ${Math.round(stats.avgResponseTimeMs / 1000)}s suggests taking extra time on this topic.`
      : '';
    items.push({
      type: 'quiz',
      topic: wt.topic,
      section: wt.topic, // quiz topic doubles as section for now
      reason: 'weak_topic',
      reasonDetail: `Recommended because mastery on ${wt.topic} is ${wt.mastery}% (accuracy ${wt.accuracy}% over ${wt.totalAttempts} attempts).${slowHint}`,
      estimatedMinutes: minutes,
      priority: 2,
      mastery: wt.mastery,
      accuracy: wt.accuracy,
    });
    remaining -= minutes;
  }

  // ── 3. Recent mistakes (recentAccuracy <60, not already weak) ─────────────
  for (const [topic, stats] of Object.entries(byTopic)) {
    if (remaining <= 0 || items.length >= MAX_ITEMS) break;
    if (items.some(i => i.topic === topic)) continue;
    if (stats.totalAttempts >= 3 && stats.recentAccuracy < 60) {
      const minutes = Math.min(QUIZ_MINUTES_PER_TOPIC, remaining);
      items.push({
        type: 'quiz',
        topic,
        section: topic,
        reason: 'recent_mistakes',
        reasonDetail: `Recent accuracy on ${topic} dropped to ${stats.recentAccuracy}% over last ${Math.min(stats.totalAttempts, 20)} attempts — quick drill recommended.`,
        estimatedMinutes: minutes,
        priority: 3,
        recentAccuracy: stats.recentAccuracy,
      });
      remaining -= minutes;
    }
  }

  // ── 4. Decay / time since last practice ───────────────────────────────────
  for (const [topic, stats] of Object.entries(byTopic)) {
    if (remaining <= 0 || items.length >= MAX_ITEMS) break;
    if (items.some(i => i.topic === topic)) continue;
    if (stats.totalAttempts >= 5 && stats.decay < 0.85) {
      const minutes = Math.min(REVIEW_MINUTES, remaining);
      items.push({
        type: 'quiz',
        topic,
        section: topic,
        reason: 'decay',
        reasonDetail: `You haven't practiced ${topic} in ${stats.daysSinceLastSeen} days — review to prevent forgetting (mastery decay ${(1 - stats.decay) * 100 | 0}%).`,
        estimatedMinutes: minutes,
        priority: 4,
        daysSinceLastSeen: stats.daysSinceLastSeen,
        decay: stats.decay,
      });
      remaining -= minutes;
    }
  }

  // ── 5. Difficulty & JLPT level fallback ────────────────────────────────────
  // If still room and no weak topics, suggest level-appropriate new topic.
  // For N5, particles/kanji are core; for N4+ grammar/reading.
  if ((remaining > 0 && items.length === 0) || (remaining > 3 && items.length < 3)) {
    const level = profile.current_level || 'N5';
    const levelTopicMap = {
      N5: 'particles',
      N4: 'grammar',
      N3: 'reading',
      N2: 'reading',
      N1: 'listening',
    };
    const fallbackTopic = levelTopicMap[level] || 'vocabulary';
    // Avoid duplicate
    if (!items.some(i => i.topic === fallbackTopic) && items.length < MAX_ITEMS) {
      const minutes = Math.min(remaining, 5);
      const isNewUser = !mastery || Object.keys(byTopic).length === 0;
      items.push({
        type: 'quiz',
        topic: fallbackTopic,
        section: fallbackTopic,
        reason: isNewUser ? 'onboarding' : 'balanced_review',
        reasonDetail: isNewUser
          ? `Start with ${level} ${fallbackTopic} to build a strong foundation.`
          : `Balanced ${level} review to maintain overall mastery at ${overall.mastery || 0}%.`,
        estimatedMinutes: minutes,
        priority: 5,
        level,
      });
      remaining -= minutes;
    }
  }

  // ── 6. Cap and final totals ───────────────────────────────────────────────
  const sliced = items.slice(0, MAX_ITEMS);
  const estimatedMinutes = sliced.reduce((s, i) => s + i.estimatedMinutes, 0);

  // If we have no items at all (edge: no mastery, no due), provide a minimal starter
  if (sliced.length === 0) {
    const level = profile.current_level || 'N5';
    return {
      session: {
        estimatedMinutes: Math.min(dailyGoal, 10),
        items: [{
          type: 'quiz',
          topic: level === 'N5' ? 'hiragana' : 'vocabulary',
          section: level === 'N5' ? 'kanji' : 'vocabulary',
          reason: 'starter',
          reasonDetail: `New learner starter for ${level} — 10-minute intro session.`,
          estimatedMinutes: Math.min(dailyGoal, 10),
          priority: 5,
          level,
        }],
      },
    };
  }

  return {
    session: {
      estimatedMinutes,
      items: sliced,
    },
  };
}

module.exports = { generateRecommendations };
