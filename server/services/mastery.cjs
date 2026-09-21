'use strict';

/**
 * Deterministic mastery engine.
 * No LLM, pure arithmetic, fully testable.
 *
 * Each topic (kanji, vocabulary, grammar, reading, listening, particles, etc.)
 * gets metrics derived from PracticeAttempt documents.
 *
 * Mastery formula (interview explainable):
 *   accuracy = correct / total * 100
 *   recentAccuracy = correct in last 20 / windowSize * 100 (fallback to accuracy if <5 attempts)
 *   baseMastery = 0.6 * accuracy + 0.4 * recentAccuracy
 *   decay = 1 for ≤7 days since last seen, else max(0.5, 1 - (days-7)*0.02)
 *   mastery = round(baseMastery * decay) clamped 0-100
 *
 * Weak if: total ≥5 AND (mastery < 60 OR accuracy < 65 OR recentAccuracy < 55)
 */

const RECENT_WINDOW = 20;
const WEAK_TOTAL_THRESHOLD = 5;
const WEAK_MASTERY_THRESHOLD = 60;

function daysBetween(a, b) {
  return (b.getTime() - a.getTime()) / 86_400_000;
}

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

/**
 * @param {Array<{isCorrect:boolean, responseTimeMs:number|null, createdAt:Date|string}>} attempts
 * @param {Date} now - used for decay, deterministic in tests
 */
function calculateTopicStats(attempts, now = new Date()) {
  if (!attempts || attempts.length === 0) {
    return {
      totalAttempts: 0,
      correctAttempts: 0,
      accuracy: 0,
      recentAccuracy: 0,
      mistakeFrequency: 0,
      avgResponseTimeMs: null,
      lastSeen: null,
      daysSinceLastSeen: null,
      decay: 1,
      mastery: 0,
      isWeak: false,
    };
  }

  // Ensure sorted oldest->newest for recent window, but compute lastSeen as max
  const sorted = [...attempts].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  const total = sorted.length;
  const correct = sorted.filter(a => a.isCorrect).length;
  const accuracy = total > 0 ? (correct / total) * 100 : 0;

  const recentSlice = sorted.slice(-RECENT_WINDOW);
  const recentTotal = recentSlice.length;
  const recentCorrect = recentSlice.filter(a => a.isCorrect).length;
  const recentAccuracy = recentTotal >= 5
    ? (recentCorrect / recentTotal) * 100
    : accuracy; // fallback until enough data

  const mistakeFrequency = total > 0 ? (total - correct) / total : 0;

  const responseTimes = sorted.map(a => a.responseTimeMs).filter(v => typeof v === 'number' && v !== null);
  const avgResponseTimeMs = responseTimes.length > 0
    ? Math.round(responseTimes.reduce((s, v) => s + v, 0) / responseTimes.length)
    : null;

  const lastSeenDate = sorted.reduce((max, a) => {
    const d = new Date(a.createdAt);
    return d > max ? d : max;
  }, new Date(sorted[0].createdAt));
  const lastSeen = lastSeenDate.toISOString();
  const daysSinceLastSeen = daysBetween(lastSeenDate, now);

  // Decay: no decay for 7 days, then linear 2% per day down to 0.5 floor
  let decay = 1;
  if (daysSinceLastSeen > 7) {
    decay = clamp(1 - (daysSinceLastSeen - 7) * 0.02, 0.5, 1);
  }

  const baseMastery = 0.6 * accuracy + 0.4 * recentAccuracy;
  const mastery = clamp(Math.round(baseMastery * decay), 0, 100);

  const isWeak = total >= WEAK_TOTAL_THRESHOLD && (
    mastery < WEAK_MASTERY_THRESHOLD ||
    accuracy < 65 ||
    recentAccuracy < 55
  );

  return {
    totalAttempts: total,
    correctAttempts: correct,
    accuracy: Math.round(accuracy * 10) / 10,
    recentAccuracy: Math.round(recentAccuracy * 10) / 10,
    mistakeFrequency: Math.round(mistakeFrequency * 1000) / 1000,
    avgResponseTimeMs,
    lastSeen,
    daysSinceLastSeen: Math.round(daysSinceLastSeen * 10) / 10,
    decay: Math.round(decay * 1000) / 1000,
    mastery,
    isWeak,
  };
}

/**
 * Groups attempts by topic and calculates stats per topic.
 * @param {Array} attempts - all PracticeAttempt docs for a user
 * @param {Date} now
 * @returns {{ byTopic: Record<string, ReturnType<typeof calculateTopicStats>>, overall: object, weakTopics: Array }}
 */
function calculateMastery(attempts, now = new Date()) {
  if (!attempts || attempts.length === 0) {
    return {
      byTopic: {},
      bySection: {},
      overall: {
        totalAttempts: 0,
        correctAttempts: 0,
        accuracy: 0,
        recentAccuracy: 0,
        mastery: 0,
        weakCount: 0,
      },
      weakTopics: [],
      lastSeen: null,
    };
  }

  // Group by topic
  const byTopicGroups = new Map();
  const bySectionGroups = new Map();

  for (const a of attempts) {
    const topic = a.topic || 'unknown';
    if (!byTopicGroups.has(topic)) byTopicGroups.set(topic, []);
    byTopicGroups.get(topic).push(a);

    const section = a.section || topic; // fallback to topic if section missing
    if (!bySectionGroups.has(section)) bySectionGroups.set(section, []);
    bySectionGroups.get(section).push(a);
  }

  const byTopic = {};
  for (const [topic, group] of byTopicGroups.entries()) {
    byTopic[topic] = calculateTopicStats(group, now);
  }

  const bySection = {};
  for (const [section, group] of bySectionGroups.entries()) {
    bySection[section] = calculateTopicStats(group, now);
  }

  // Overall: treat all attempts as one pool
  const overallStats = calculateTopicStats(attempts, now);
  const weakTopics = Object.entries(byTopic)
    .filter(([, stats]) => stats.isWeak)
    .map(([topic, stats]) => ({
      topic,
      mastery: stats.mastery,
      accuracy: stats.accuracy,
      recentAccuracy: stats.recentAccuracy,
      totalAttempts: stats.totalAttempts,
      lastSeen: stats.lastSeen,
      reason: stats.recentAccuracy < 55
        ? `recent accuracy ${stats.recentAccuracy}% over last ${Math.min(stats.totalAttempts, RECENT_WINDOW)} attempts`
        : stats.accuracy < 65
          ? `accuracy ${stats.accuracy}% over ${stats.totalAttempts} attempts`
          : `mastery ${stats.mastery}% below ${WEAK_MASTERY_THRESHOLD}%`,
    }))
    .sort((a, b) => a.mastery - b.mastery);

  const lastSeenOverall = attempts.reduce((max, a) => {
    const d = new Date(a.createdAt);
    return d > max ? d : max;
  }, new Date(attempts[0].createdAt)).toISOString();

  return {
    byTopic,
    bySection,
    overall: {
      totalAttempts: overallStats.totalAttempts,
      correctAttempts: overallStats.correctAttempts,
      accuracy: overallStats.accuracy,
      recentAccuracy: overallStats.recentAccuracy,
      mastery: overallStats.mastery,
      avgResponseTimeMs: overallStats.avgResponseTimeMs,
      weakCount: weakTopics.length,
    },
    weakTopics,
    lastSeen: lastSeenOverall,
  };
}

module.exports = {
  calculateTopicStats,
  calculateMastery,
  RECENT_WINDOW,
  WEAK_TOTAL_THRESHOLD,
  WEAK_MASTERY_THRESHOLD,
};
