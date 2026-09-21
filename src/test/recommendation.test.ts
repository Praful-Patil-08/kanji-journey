// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { generateRecommendations } = require('../../server/services/recommendation.cjs');
const { calculateMastery } = require('../../server/services/mastery.cjs');

function mkAttempts(topic: string, n: number, correct: number, start = '2026-01-01T00:00:00Z') {
  const startDate = new Date(start);
  const out: any[] = [];
  for (let i = 0; i < n; i++) {
    out.push({
      topic,
      section: topic,
      isCorrect: i < correct,
      responseTimeMs: 1500,
      createdAt: new Date(startDate.getTime() + i * 3600_000).toISOString(),
    });
  }
  return out;
}

describe('generateRecommendations', () => {
  it('due cards always first with reason due', () => {
    const attempts = mkAttempts('kanji', 10, 8);
    const mastery = calculateMastery(attempts, new Date('2026-01-02T00:00:00Z'));
    const res = generateRecommendations({
      dueCount: 7,
      mastery,
      profile: { current_level: 'N5', daily_goal_minutes: 15 },
      now: new Date('2026-01-02T00:00:00Z'),
    });
    expect(res.session.items[0].type).toBe('flashcard');
    expect(res.session.items[0].reason).toBe('due');
    expect(res.session.items[0].reasonDetail).toContain('7 cards');
    expect(res.session.items[0].estimatedMinutes).toBeGreaterThan(0);
  });

  it('new user with no data gets starter', () => {
    const res = generateRecommendations({
      dueCount: 0,
      mastery: calculateMastery([], new Date('2026-01-02T00:00:00Z')),
      profile: { current_level: 'N5', daily_goal_minutes: 15 },
    });
    expect(res.session.items.length).toBeGreaterThan(0);
    expect(res.session.estimatedMinutes).toBeGreaterThan(0);
    expect(res.session.items[0].reasonDetail.length).toBeGreaterThan(10);
  });

  it('weak topic generates quiz with explainable reason', () => {
    // particles very weak (20% accuracy)
    const attempts = [
      ...mkAttempts('particles', 10, 2, '2026-01-01T00:00:00Z'),
      ...mkAttempts('kanji', 10, 9, '2026-01-01T00:00:00Z'),
    ];
    const mastery = calculateMastery(attempts, new Date('2026-01-03T00:00:00Z'));
    const res = generateRecommendations({
      dueCount: 0,
      mastery,
      profile: { current_level: 'N5', daily_goal_minutes: 15 },
    });
    const weakItem = res.session.items.find(i => i.topic === 'particles');
    expect(weakItem).toBeTruthy();
    expect(weakItem?.reason).toBe('weak_topic');
    expect(weakItem?.reasonDetail).toContain('particles');
    expect(weakItem?.reasonDetail).toContain('mastery');
  });

  it('recent mistakes triggers recommendation', () => {
    // Need >20 attempts so recent window (20) differs from overall.
    // 30 attempts: first 20 correct, last 10 with 1 correct → overall 21/30=70% (not weak), recent 20 = 11/20=55% (<60) → should trigger recent_mistakes
    const attempts: any[] = [];
    const start = new Date('2026-01-01T00:00:00Z');
    for (let i = 0; i < 30; i++) {
      const isCorrect = i < 20 ? true : i === 20; // first 20 all correct, only first of last 10 correct
      attempts.push({ topic: 'vocab', section: 'vocabulary', isCorrect, responseTimeMs: 1500, createdAt: new Date(start.getTime() + i * 3600_000).toISOString() });
    }
    const mastery = calculateMastery(attempts, new Date('2026-01-03T00:00:00Z'));
    // Verify mastery is not weak but recent is low
    expect(mastery.byTopic['vocab'].accuracy).toBeCloseTo(70, 0);
    expect(mastery.byTopic['vocab'].recentAccuracy).toBe(55);
    expect(mastery.byTopic['vocab'].isWeak).toBe(false);
    const res = generateRecommendations({ dueCount: 0, mastery, profile: { current_level: 'N5', daily_goal_minutes: 15 } });
    const item = res.session.items.find(i => i.topic === 'vocab');
    expect(item).toBeTruthy();
    expect(item?.reason).toBe('recent_mistakes');
    expect(item?.reasonDetail).toContain('vocab');
  });

  it('respects daily_goal_minutes and caps items to 5', () => {
    const attempts = [
      ...mkAttempts('particles', 10, 2),
      ...mkAttempts('kanji', 10, 3),
      ...mkAttempts('grammar', 10, 2),
      ...mkAttempts('vocabulary', 10, 3),
      ...mkAttempts('reading', 10, 2),
      ...mkAttempts('listening', 10, 1),
    ];
    const mastery = calculateMastery(attempts, new Date('2026-01-03T00:00:00Z'));
    const res = generateRecommendations({
      dueCount: 10,
      mastery,
      profile: { current_level: 'N5', daily_goal_minutes: 15 },
    });
    expect(res.session.items.length).toBeLessThanOrEqual(5);
    expect(res.session.estimatedMinutes).toBeLessThanOrEqual(15 + 5); // allow slight overflow due to rounding
  });

  it('JLPT level affects fallback topic', () => {
    const mastery = calculateMastery([], new Date('2026-01-02T00:00:00Z'));
    const n5 = generateRecommendations({ dueCount: 0, mastery, profile: { current_level: 'N5', daily_goal_minutes: 10 } });
    const n3 = generateRecommendations({ dueCount: 0, mastery, profile: { current_level: 'N3', daily_goal_minutes: 10 } });
    // Fallback topics differ by level
    expect(n5.session.items[0].topic).not.toBe(n3.session.items[0].topic);
  });

  it('every item has explainable reasonDetail', () => {
    const attempts = mkAttempts('kanji', 10, 2);
    const mastery = calculateMastery(attempts, new Date('2026-01-03T00:00:00Z'));
    const res = generateRecommendations({ dueCount: 3, mastery, profile: { current_level: 'N5', daily_goal_minutes: 15 } });
    for (const item of res.session.items) {
      expect(item.reasonDetail.length).toBeGreaterThan(10);
      expect(item.reason).toBeTruthy();
      expect(item.estimatedMinutes).toBeGreaterThan(0);
      expect(item.priority).toBeGreaterThan(0);
    }
  });

  it('deterministic with same inputs', () => {
    const attempts = mkAttempts('kanji', 10, 6);
    const mastery = calculateMastery(attempts, new Date('2026-01-03T00:00:00Z'));
    const p = { dueCount: 2, mastery, profile: { current_level: 'N5', daily_goal_minutes: 15 } };
    const a = generateRecommendations(p);
    const b = generateRecommendations(p);
    expect(a).toEqual(b);
  });

  it('no duplicate topics in same session', () => {
    const attempts = [
      ...mkAttempts('particles', 10, 2),
      ...mkAttempts('particles', 10, 2), // duplicate to inflate weak count but same topic
    ];
    const mastery = calculateMastery(attempts, new Date('2026-01-03T00:00:00Z'));
    const res = generateRecommendations({ dueCount: 0, mastery, profile: { current_level: 'N5', daily_goal_minutes: 20 } });
    const topics = res.session.items.map(i => i.topic).filter(Boolean);
    const unique = new Set(topics);
    expect(topics.length).toBe(unique.size);
  });
});
