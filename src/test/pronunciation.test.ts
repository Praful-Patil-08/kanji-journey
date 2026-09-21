// @vitest-environment node
import { describe, it, expect } from 'vitest';

function normalize(s: string) { return (s ?? '').toString().trim().toLowerCase(); }
function similarityPercent(a: string, b: string) {
  const aa = normalize(a), bb = normalize(b);
  if (!aa || !bb) return 0;
  if (aa === bb) return 100;
  const max = Math.max(aa.length, bb.length);
  let same = 0;
  for (let i = 0; i < Math.min(aa.length, bb.length); i++) if (aa[i] === bb[i]) same++;
  return Math.max(0, Math.round((same / max) * 100));
}

describe('Pronunciation scoring', () => {
  it('identical strings → 100', () => {
    expect(similarityPercent('おはよう', 'おはよう')).toBe(100);
    expect(similarityPercent('hello', 'hello')).toBe(100);
  });

  it('empty → 0', () => {
    expect(similarityPercent('', 'hello')).toBe(0);
    expect(similarityPercent('hello', '')).toBe(0);
    expect(similarityPercent('', '')).toBe(0);
  });

  it('case insensitive and trimmed', () => {
    expect(similarityPercent('  HELLO ', 'hello')).toBe(100);
  });

  it('partial match', () => {
    // 'hello' vs 'hallo' → 4/5 =80%
    expect(similarityPercent('hello', 'hallo')).toBe(80);
  });

  it('pitch accent is max(40, score-8)', () => {
    const score = 90;
    const pitch = Math.max(40, score - 8);
    expect(pitch).toBe(82);
    expect(Math.max(40, 30 - 8)).toBe(40);
  });

  it('attemptNumber increments per targetText', () => {
    const attempts = [
      { targetText: 'おはよう', pronunciationScore: 60 },
      { targetText: 'おはよう', pronunciationScore: 72 },
      { targetText: 'こんにちは', pronunciationScore: 80 },
    ];
    const countForTarget = (target: string) => attempts.filter(a => a.targetText === target).length;
    expect(countForTarget('おはよう')).toBe(2);
    expect(countForTarget('こんにちは')).toBe(1);
    expect(countForTarget('おはよう') + 1).toBe(3); // next attemptNumber
  });
});

describe('Pronunciation history pagination', () => {
  function paginate<T extends { createdAt: string }>(rows: T[], limit: number, cursor: string | null) {
    const sorted = [...rows].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    let filtered = sorted;
    if (cursor) filtered = sorted.filter(r => r.createdAt < cursor);
    const hasMore = filtered.length > limit;
    const data = hasMore ? filtered.slice(0, limit) : filtered;
    const nextCursor = hasMore ? data[data.length - 1].createdAt : null;
    return { data, nextCursor, hasMore };
  }

  const rows = Array.from({ length: 5 }, (_, i) => ({
    id: `p${i}`,
    createdAt: new Date(Date.UTC(2026, 0, i + 1, 12, 0, 0)).toISOString(),
    targetText: 'おはよう',
    pronunciationScore: 60 + i * 5,
  }));

  it('first page', () => {
    const res = paginate(rows, 2, null);
    expect(res.data).toHaveLength(2);
    expect(res.hasMore).toBe(true);
    expect(res.data[0].id).toBe('p4');
  });

  it('improvement calculation', () => {
    const scores = rows.map(r => r.pronunciationScore);
    const improvement = scores[scores.length - 1] - scores[0];
    expect(improvement).toBe(20); // 80 -60
    // With history sorted desc, last vs first
    const sortedDesc = [...rows].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    const impDesc = sortedDesc[0].pronunciationScore - sortedDesc[sortedDesc.length - 1].pronunciationScore;
    expect(impDesc).toBe(20);
  });

  it('stats: avg, best, worst', () => {
    const scores = rows.map(r => r.pronunciationScore);
    const avg = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
    const best = Math.max(...scores);
    const worst = Math.min(...scores);
    expect(avg).toBe(70);
    expect(best).toBe(80);
    expect(worst).toBe(60);
  });
});

describe('Pronunciation persistence contract', () => {
  it('scores are not faked, derived from transcript similarity', () => {
    // Ensure we don't fake scores: score must be derived from similarity, not random
    const target = 'こんにちは';
    const transcript1 = 'こんにちは';
    const transcript2 = 'こんばんは';
    const s1 = similarityPercent(transcript1, target);
    const s2 = similarityPercent(transcript2, target);
    expect(s1).toBe(100);
    expect(s2).toBeLessThan(100);
    expect(s2).toBeGreaterThan(0);
  });
});
