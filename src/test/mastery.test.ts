// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { calculateTopicStats, calculateMastery } = require('../../server/services/mastery.cjs');

function makeAttempts(n: number, correct: number, opts?: { topic?: string; section?: string; startDate?: string; responseTimeMs?: number | null }) {
  const topic = opts?.topic ?? 'kanji';
  const section = opts?.section ?? 'vocabulary';
  const start = opts?.startDate ? new Date(opts.startDate) : new Date('2026-01-01T12:00:00Z');
  const out: any[] = [];
  for (let i = 0; i < n; i++) {
    const d = new Date(start.getTime() + i * 86_400_000); // 1 day apart
    out.push({
      topic,
      section,
      isCorrect: i < correct ? true : false, // first `correct` are correct, rest wrong (but we need to control order for recent window)
      responseTimeMs: opts?.responseTimeMs ?? 1800,
      createdAt: d.toISOString(),
    });
  }
  // For recent window tests we want recent items to be correct/wrong as needed, so sort by date
  // Our helper creates oldest first; tests can reorder as needed
  return out;
}

describe('calculateTopicStats', () => {
  const now = new Date('2026-02-01T12:00:00Z');

  it('empty attempts → zero mastery', () => {
    const s = calculateTopicStats([], now);
    expect(s.totalAttempts).toBe(0);
    expect(s.mastery).toBe(0);
    expect(s.isWeak).toBe(false);
    expect(s.accuracy).toBe(0);
  });

  it('perfect accuracy → mastery 100', () => {
    const attempts = makeAttempts(10, 10);
    const s = calculateTopicStats(attempts, new Date('2026-01-11T12:00:00Z'));
    expect(s.totalAttempts).toBe(10);
    expect(s.correctAttempts).toBe(10);
    expect(s.accuracy).toBe(100);
    expect(s.recentAccuracy).toBe(100);
    expect(s.mastery).toBe(100);
    expect(s.isWeak).toBe(false);
  });

  it('0% accuracy → mastery 0 and weak if enough attempts', () => {
    const attempts = makeAttempts(10, 0);
    const s = calculateTopicStats(attempts, new Date('2026-01-12T12:00:00Z'));
    expect(s.accuracy).toBe(0);
    expect(s.mastery).toBe(0);
    expect(s.isWeak).toBe(true);
  });

  it('recent accuracy weighted: recent 100% but overall 50% → mastery ~80', () => {
    // 30 attempts: first 15 wrong, last 15 correct → recent window (last 20) = 15 correct /20 =75% ?
    // Let's make 10 attempts: first 5 wrong, last 5 correct → overall 50%, recent 50% (since all 10 in window)
    // Need clearer: 30 attempts where last 20 are all correct
    const attempts: any[] = [];
    const start = new Date('2026-01-01T12:00:00Z');
    for (let i = 0; i < 30; i++) {
      const d = new Date(start.getTime() + i * 3600_000);
      const isCorrect = i >= 10; // first 10 wrong, last 20 correct
      attempts.push({ topic: 'grammar', section: 'grammar', isCorrect, responseTimeMs: 1500, createdAt: d.toISOString() });
    }
    const s = calculateTopicStats(attempts, new Date('2026-01-02T12:00:00Z'));
    // accuracy = 20/30 =66.7, recentAccuracy = 20/20=100, base=0.6*66.7+0.4*100=80
    expect(s.accuracy).toBeCloseTo(66.7, 1);
    expect(s.recentAccuracy).toBe(100);
    expect(s.mastery).toBe(80);
  });

  it('decay after 7 days reduces mastery', () => {
    const attempts = makeAttempts(10, 8, { startDate: '2026-01-01T12:00:00Z' });
    const recentNow = new Date('2026-01-11T12:00:00Z'); // lastSeen 2026-01-10 → 1 day ago → no decay
    const laterNow = new Date('2026-02-15T12:00:00Z'); // ~36 days since lastSeen → decay floor 0.5?
    const s1 = calculateTopicStats(attempts, recentNow);
    const s2 = calculateTopicStats(attempts, laterNow);
    expect(s1.decay).toBe(1);
    expect(s2.decay).toBeLessThan(1);
    expect(s2.mastery).toBeLessThan(s1.mastery);
    expect(s2.decay).toBeGreaterThanOrEqual(0.5);
  });

  it('no decay within 7 days', () => {
    const attempts = makeAttempts(5, 5, { startDate: '2026-01-01T12:00:00Z' });
    const now = new Date('2026-01-05T12:00:00Z'); // 3 days after last (Jan 05 is 0 days? last is Jan 05? actually start Jan01 +4 days = Jan05)
    const s = calculateTopicStats(attempts, now);
    expect(s.decay).toBe(1);
  });

  it('avgResponseTime calculated', () => {
    const attempts = [
      { topic: 'kanji', section: 'vocabulary', isCorrect: true, responseTimeMs: 1000, createdAt: '2026-01-01T00:00:00Z' },
      { topic: 'kanji', section: 'vocabulary', isCorrect: true, responseTimeMs: 2000, createdAt: '2026-01-02T00:00:00Z' },
      { topic: 'kanji', section: 'vocabulary', isCorrect: false, responseTimeMs: null, createdAt: '2026-01-03T00:00:00Z' },
    ];
    const s = calculateTopicStats(attempts, new Date('2026-01-04T00:00:00Z'));
    expect(s.avgResponseTimeMs).toBe(1500);
  });

  it('weak detection thresholds', () => {
    // 10 attempts, 6 correct → accuracy 60% (<65) + total>=5 → weak
    const attempts = makeAttempts(10, 6);
    const s = calculateTopicStats(attempts, new Date('2026-01-12T12:00:00Z'));
    expect(s.isWeak).toBe(true);
    // 10 attempts, 9 correct → 90% → not weak
    const strong = makeAttempts(10, 9);
    const s2 = calculateTopicStats(strong, new Date('2026-01-12T12:00:00Z'));
    expect(s2.isWeak).toBe(false);
    // <5 attempts never weak even if 0%
    const few = makeAttempts(3, 0);
    const s3 = calculateTopicStats(few, new Date('2026-01-04T12:00:00Z'));
    expect(s3.isWeak).toBe(false);
  });

  it('mistakeFrequency correct', () => {
    const attempts = makeAttempts(10, 7);
    const s = calculateTopicStats(attempts, new Date('2026-01-12T12:00:00Z'));
    expect(s.mistakeFrequency).toBeCloseTo(0.3, 2);
  });
});

describe('calculateMastery', () => {
  const now = new Date('2026-02-01T12:00:00Z');

  it('empty → empty maps', () => {
    const r = calculateMastery([], now);
    expect(r.byTopic).toEqual({});
    expect(r.overall.mastery).toBe(0);
    expect(r.weakTopics).toEqual([]);
  });

  it('groups by topic and section', () => {
    const recentNow = new Date('2026-01-06T12:00:00Z');
    const attempts = [
      ...makeAttempts(5, 5, { topic: 'kanji', section: 'vocabulary', startDate: '2026-01-01T00:00:00Z' }),
      ...makeAttempts(5, 0, { topic: 'grammar', section: 'grammar', startDate: '2026-01-01T00:00:00Z' }),
    ];
    const r = calculateMastery(attempts, recentNow);
    expect(r.byTopic['kanji'].mastery).toBeGreaterThan(80);
    expect(r.byTopic['grammar'].mastery).toBeLessThan(20);
    expect(r.bySection['vocabulary'].totalAttempts).toBe(5);
    expect(r.bySection['grammar'].totalAttempts).toBe(5);
  });

  it('weakTopics sorted by mastery ascending', () => {
    const attempts = [
      ...makeAttempts(10, 2, { topic: 'particles', section: 'grammar', startDate: '2026-01-01T00:00:00Z' }), // 20%
      ...makeAttempts(10, 5, { topic: 'kanji', section: 'vocabulary', startDate: '2026-01-01T00:00:00Z' }), // 50%
      ...makeAttempts(10, 9, { topic: 'reading', section: 'reading', startDate: '2026-01-01T00:00:00Z' }), // 90% not weak
    ];
    const r = calculateMastery(attempts, now);
    expect(r.weakTopics.length).toBe(2);
    expect(r.weakTopics[0].topic).toBe('particles'); // lower mastery first
    expect(r.weakTopics[1].topic).toBe('kanji');
  });

  it('overall mastery weighted across topics', () => {
    const recentNow = new Date('2026-01-11T12:00:00Z');
    const attempts = [
      ...makeAttempts(10, 10, { topic: 'kanji', section: 'kanji', startDate: '2026-01-01T00:00:00Z' }),
      ...makeAttempts(10, 0, { topic: 'grammar', section: 'grammar', startDate: '2026-01-01T00:00:00Z' }),
    ];
    const r = calculateMastery(attempts, recentNow);
    // overall 50% accuracy → mastery ~50 (no decay within 7 days of lastSeen Jan10)
    expect(r.overall.accuracy).toBe(50);
    expect(r.overall.mastery).toBeGreaterThan(40);
    expect(r.overall.mastery).toBeLessThan(60);
  });

  it('deterministic with same now', () => {
    const attempts = makeAttempts(10, 7, { startDate: '2026-01-01T00:00:00Z' });
    const r1 = calculateMastery(attempts, new Date('2026-01-15T00:00:00Z'));
    const r2 = calculateMastery(attempts, new Date('2026-01-15T00:00:00Z'));
    expect(r1).toEqual(r2);
  });

  it('different now gives different decay', () => {
    const attempts = makeAttempts(10, 8, { startDate: '2026-01-01T00:00:00Z' });
    const r1 = calculateMastery(attempts, new Date('2026-01-12T00:00:00Z'));
    const r2 = calculateMastery(attempts, new Date('2026-03-01T00:00:00Z'));
    expect(r2.byTopic['kanji'].mastery).toBeLessThan(r1.byTopic['kanji'].mastery);
  });
});
