'use strict';

const { CATALOG_WITH_COLLECTION } = require('../data/lessonCatalog.cjs');

/**
 * Scoped RAG for Scholar AI
 * - Only retrieves relevant lesson material + learner mistakes + SRS state
 * - Enforces token/context limits
 * - No LLM for retrieval
 */

// Approximate token counting: 1 token ~ 4 chars
function estimateTokens(text) {
  return Math.ceil((text || '').length / 4);
}

function truncateToTokens(text, maxTokens) {
  const maxChars = maxTokens * 4;
  if ((text || '').length <= maxChars) return text;
  // Reserve 1 char for ellipsis so total tokens ≤ maxTokens
  return text.slice(0, maxChars - 1) + '…';
}

// Keyword-based lesson retriever (deterministic, no embeddings needed for portfolio)
// Returns up to `limit` most relevant lessons for the query/topic/level
function retrieveRelevantLessons({ message = '', currentLessonId = null, currentTopic = null, level = 'N5', limit = 3 } = {}) {
  const query = `${message} ${currentTopic || ''}`.toLowerCase();
  const keywords = query.split(/[\s、。！？!?,]+/).filter(Boolean).slice(0, 20);

  // Score each lesson
  const scored = CATALOG_WITH_COLLECTION.map(lesson => {
    let score = 0;
    // Exact lesson match gets highest score
    if (currentLessonId && lesson.id === currentLessonId) score += 100;
    // Topic match
    if (currentTopic && lesson.topics.some(t => currentTopic.toLowerCase().includes(t.toLowerCase()) || t.toLowerCase().includes(currentTopic.toLowerCase()))) {
      score += 30;
    }
    // Level match (prefer user's level, but allow one level above/below)
    if (lesson.level === level) score += 10;
    else if (level === 'N5' && lesson.level === 'N4') score += 2;

    // Keyword matches in title/topics
    const haystack = `${lesson.title} ${lesson.topics.join(' ')} ${lesson.skill_area}`.toLowerCase();
    for (const kw of keywords) {
      if (kw.length < 2) continue;
      if (haystack.includes(kw)) score += 5;
      // Special handling for Japanese particles
      if (['は', 'が', 'を', 'に', 'で', 'へ', 'と', 'も', 'か'].includes(kw) && lesson.topics.includes('particles')) score += 15;
    }
    // Special boost for は vs が query
    if (query.includes('は') && query.includes('が')) {
      if (lesson.id === 'n5-w3-l2') score += 25;
      else if (lesson.topics.includes('particles')) score += 10;
    }

    return { lesson, score };
  });

  // Sort by score desc, filter >0, limit
  const filtered = scored.filter(s => s.score > 0).sort((a, b) => b.score - a.score).slice(0, limit);
  // If no keyword match, fallback to currentLessonId or level-appropriate lesson
  if (filtered.length === 0) {
    if (currentLessonId) {
      const l = CATALOG_WITH_COLLECTION.find(x => x.id === currentLessonId);
      if (l) return [{ lesson: l, score: 50 }];
    }
    // Fallback: first lesson of user's level
    const fallback = CATALOG_WITH_COLLECTION.find(x => x.level === level) || CATALOG_WITH_COLLECTION[0];
    return [{ lesson: fallback, score: 10 }];
  }
  return filtered;
}

// Build learner-specific context from mastery + recent attempts + SRS
// Limits: weak topics ≤3, recent mistakes ≤3, due count included
function buildLearnerContext({ mastery = null, recentAttempts = [], dueCount = 0 } = {}) {
  const parts = [];

  if (mastery) {
    if (mastery.weakTopics && mastery.weakTopics.length > 0) {
      parts.push(`Weak topics (${mastery.weakTopics.length}):`);
      for (const w of mastery.weakTopics.slice(0, 3)) {
        parts.push(`- ${w.topic}: mastery ${w.mastery}%, accuracy ${w.accuracy}% (${w.totalAttempts} attempts, ${w.reason})`);
      }
    } else if (mastery.overall) {
      parts.push(`Overall mastery ${mastery.overall.mastery}% (accuracy ${mastery.overall.accuracy}%, ${mastery.overall.totalAttempts} attempts) — no weak topics, doing well.`);
    }

    // Recent mistakes: last 5 incorrect attempts
    const recentMistakes = (recentAttempts || []).filter(a => !a.isCorrect).slice(0, 5);
    if (recentMistakes.length > 0) {
      parts.push(`Recent mistakes (last ${recentMistakes.length}):`);
      for (const m of recentMistakes.slice(0, 3)) {
        parts.push(`- ${m.topic}: selected "${m.selectedAnswer}" vs correct "${m.correctAnswer}" (question ${m.questionId})`);
      }
    }

    if (dueCount > 0) {
      parts.push(`SRS: ${dueCount} card${dueCount === 1 ? '' : 's'} due for review today.`);
    } else {
      parts.push(`SRS: no cards due — all caught up.`);
    }

    if (mastery.overall && mastery.overall.recentAccuracy) {
      parts.push(`Recent accuracy (last 20): ${mastery.overall.recentAccuracy}% vs avg ${mastery.overall.accuracy}%.`);
    }
  }

  return parts.join('\n');
}

// Build lesson context string, truncated
function buildLessonContext(relevantLessons) {
  if (!relevantLessons || relevantLessons.length === 0) return '';
  const parts = ['Relevant lesson material:'];
  for (const { lesson } of relevantLessons) {
    parts.push(`- ${lesson.title} [${lesson.level} Week ${lesson.week_number}] — ${lesson.skill_area}, topics: ${lesson.topics.join(', ')}`);
    if (lesson.characters && lesson.characters.length > 0) {
      parts.push(`  Characters: ${lesson.characters.slice(0, 10).join(' ')}`);
    }
  }
  return parts.join('\n');
}

// Main scoped context builder with token limits
// Returns { context, lessonCount, learnerLines, tokens }
function buildScopedContext({
  profile = null,
  relevantLessons = [],
  learnerContext = '',
  currentPage = null,
  currentLessonId = null,
  currentTopic = null,
  maxTokens = 800,
} = {}) {
  const sections = [];

  if (profile) {
    const p = profile;
    sections.push(`Learner: ${p.display_name || 'Student'} | Level: ${p.current_level || 'N5'} | Streak: ${p.streak || 0}d | XP: ${p.xp || 0} | Daily goal: ${p.daily_goal_minutes || 15}min`);
  }

  if (currentPage) sections.push(`Current page: ${currentPage}`);
  if (currentLessonId) sections.push(`Current lesson: ${currentLessonId}`);
  if (currentTopic) sections.push(`Current topic: ${currentTopic}`);

  const lessonContext = buildLessonContext(relevantLessons);
  if (lessonContext) sections.push(lessonContext);
  if (learnerContext) sections.push(learnerContext);

  let context = sections.join('\n\n');
  const tokensBefore = estimateTokens(context);
  if (tokensBefore > maxTokens) {
    context = truncateToTokens(context, maxTokens);
  }

  return {
    context,
    lessonCount: relevantLessons.length,
    tokens: estimateTokens(context),
    truncated: tokensBefore > maxTokens,
  };
}

module.exports = {
  retrieveRelevantLessons,
  buildLearnerContext,
  buildLessonContext,
  buildScopedContext,
  estimateTokens,
  truncateToTokens,
};
