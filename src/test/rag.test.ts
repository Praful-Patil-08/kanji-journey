// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { retrieveRelevantLessons, buildLearnerContext, buildScopedContext, estimateTokens, truncateToTokens } = require('../../server/services/rag.cjs');
const { calculateMastery } = require('../../server/services/mastery.cjs');

describe('RAG retrieveRelevantLessons', () => {
  it('exact currentLessonId gets highest score', () => {
    const res = retrieveRelevantLessons({ message: 'hello', currentLessonId: 'n5-w3-l2', level: 'N5', limit: 3 });
    expect(res[0].lesson.id).toBe('n5-w3-l2');
    expect(res[0].score).toBeGreaterThanOrEqual(100);
  });

  it('は vs が retrieves Core Particles lesson', () => {
    const res = retrieveRelevantLessons({ message: 'は vs が difference', level: 'N5', limit: 3 });
    const ids = res.map(r => r.lesson.id);
    expect(ids).toContain('n5-w3-l2');
  });

  it('message about hiragana retrieves hiragana lessons', () => {
    const res = retrieveRelevantLessons({ message: 'hiragana あいうえお', level: 'N5' });
    expect(res[0].lesson.topics).toContain('hiragana');
  });

  it('limits to 3 and returns fallback for unknown query', () => {
    const res = retrieveRelevantLessons({ message: 'xyz unknown', level: 'N5', limit: 3 });
    expect(res.length).toBeGreaterThan(0);
    expect(res.length).toBeLessThanOrEqual(3);
  });

  it('respects level: N5 query prefers N5 over N1', () => {
    const res = retrieveRelevantLessons({ message: 'kanji', level: 'N5', limit: 5 });
    // At least one N5 lesson should be in top
    expect(res.some(r => r.lesson.level === 'N5')).toBe(true);
  });
});

describe('RAG buildLearnerContext', () => {
  it('includes weak topics, recent mistakes and SRS', () => {
    const attempts: any[] = [];
    const start = new Date('2026-01-01T00:00:00Z');
    for (let i = 0; i < 10; i++) {
      attempts.push({ topic: 'particles', section: 'grammar', isCorrect: i < 2, responseTimeMs: 1500, createdAt: new Date(start.getTime() + i * 3600000).toISOString(), selectedAnswer: 'a', correctAnswer: 'b', questionId: `q${i}` });
    }
    const mastery = calculateMastery(attempts, new Date('2026-01-02T00:00:00Z'));
    const recentAttempts = attempts.slice(-5).map(a => ({ ...a, isCorrect: false, selectedAnswer: 'は', correctAnswer: 'が', questionId: 'q1', topic: 'particles' }));
    const ctx = buildLearnerContext({ mastery, recentAttempts, dueCount: 7 });
    expect(ctx).toContain('Weak topics');
    expect(ctx).toContain('particles');
    expect(ctx).toContain('Recent mistakes');
    expect(ctx).toContain('7 cards due');
  });

  it('handles empty mastery', () => {
    const ctx = buildLearnerContext({ mastery: calculateMastery([], new Date()), recentAttempts: [], dueCount: 0 });
    expect(ctx).toContain('no weak topics');
    expect(ctx).toContain('no cards due');
  });

  it('caps weak topics to 3 and mistakes to 3', () => {
    const attempts: any[] = [];
    const start = new Date('2026-01-01T00:00:00Z');
    const topics = ['particles', 'kanji', 'grammar', 'vocabulary', 'reading'];
    for (const t of topics) {
      for (let i = 0; i < 10; i++) {
        attempts.push({ topic: t, section: t, isCorrect: false, responseTimeMs: 1500, createdAt: new Date(start.getTime() + i * 3600000).toISOString(), selectedAnswer: 'x', correctAnswer: 'y', questionId: `q-${t}-${i}` });
      }
    }
    const mastery = calculateMastery(attempts, new Date('2026-01-02T00:00:00Z'));
    const ctx = buildLearnerContext({ mastery, recentAttempts: attempts.slice(0, 10), dueCount: 12 });
    // Should have at most 3 weak topics listed
    const weakLines = ctx.split('\n').filter(l => l.startsWith('- ') && l.includes('mastery'));
    expect(weakLines.length).toBeLessThanOrEqual(3);
  });
});

describe('RAG buildScopedContext', () => {
  it('builds context with profile, lesson and learner', () => {
    const profile = { display_name: 'Test', current_level: 'N5', streak: 3, xp: 100, daily_goal_minutes: 15 };
    const lessons = retrieveRelevantLessons({ message: 'は vs が', level: 'N5', limit: 1 });
    const learnerContext = 'Weak topics:\n- particles: mastery 40%';
    const res = buildScopedContext({ profile, relevantLessons: lessons, learnerContext, currentPage: '/library/p1', currentLessonId: 'n5-w3-l2', currentTopic: 'particles', maxTokens: 800 });
    expect(res.context).toContain('Learner: Test');
    expect(res.context).toContain('Current page: /library/p1');
    expect(res.context).toContain('Relevant lesson material');
    expect(res.context).toContain('Weak topics');
    expect(res.lessonCount).toBe(1);
    expect(res.tokens).toBeLessThanOrEqual(800);
    expect(res.truncated).toBe(false);
  });

  it('truncates when over token limit', () => {
    const profile = { display_name: 'A'.repeat(5000), current_level: 'N5', streak: 0, xp: 0, daily_goal_minutes: 15 };
    const lessons = retrieveRelevantLessons({ message: 'a'.repeat(5000), level: 'N5', limit: 3 });
    const learnerContext = 'x'.repeat(5000);
    const res = buildScopedContext({ profile, relevantLessons: lessons, learnerContext, maxTokens: 100 });
    expect(res.tokens).toBeLessThanOrEqual(100);
    expect(res.truncated).toBe(true);
    expect(res.context.endsWith('…')).toBe(true);
  });

  it('estimateTokens and truncateToTokens work', () => {
    expect(estimateTokens('hello world')).toBeGreaterThan(0);
    expect(estimateTokens('')).toBe(0);
    const long = 'a'.repeat(1000);
    const truncated = truncateToTokens(long, 100);
    expect(estimateTokens(truncated)).toBeLessThanOrEqual(100);
    expect(truncated.length).toBeLessThan(long.length);
  });

  it('only retrieves relevant, not entire DB', () => {
    const lessons = retrieveRelevantLessons({ message: 'は vs が', level: 'N5', limit: 3 });
    expect(lessons.length).toBeLessThanOrEqual(3);
    // DB has 21 lessons, we only return 3
    expect(lessons.length).toBeLessThan(21);
  });
});
