// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { sm2Review } = require('../../server/services/srs.cjs');

function baseCard(overrides: Partial<Record<string, any>> = {}) {
  return {
    ease_factor: 2.5,
    interval_days: 1,
    reviews_total: 0,
    reviews_correct: 0,
    review_state: 'new',
    ...overrides,
  };
}

describe('SM-2 server implementation (grades 0-5)', () => {
  it('grade 0: interval 1, ease drops, learning, not correct', () => {
    const card = baseCard({ ease_factor: 2.5, interval_days: 10, review_state: 'review', reviews_total: 5, reviews_correct: 3 });
    const r = sm2Review(card, 0);
    expect(r.interval_days).toBe(1);
    expect(r.review_state).toBe('learning');
    expect(r.ease_factor).toBeCloseTo(2.3, 2); // 2.5 -0.2
    expect(r.reviews_total).toBe(6);
    expect(r.reviews_correct).toBe(3); // not incremented
    expect(r.next_review_date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('grade 1: interval 1, ease drops', () => {
    const card = baseCard({ ease_factor: 2.5, interval_days: 5, review_state: 'review' });
    const r = sm2Review(card, 1);
    expect(r.interval_days).toBe(1);
    expect(r.review_state).toBe('learning');
    expect(r.ease_factor).toBeCloseTo(2.3, 2);
    expect(r.reviews_total).toBe(1);
    expect(r.reviews_correct).toBe(0);
  });

  it('grade 2: interval 1, still learning', () => {
    const card = baseCard({ ease_factor: 2.5, interval_days: 6, review_state: 'review' });
    const r = sm2Review(card, 2);
    expect(r.interval_days).toBe(1);
    expect(r.review_state).toBe('learning');
    expect(r.ease_factor).toBeCloseTo(2.3, 2);
  });

  it('grade 3: interval 6 (first success), ease ~2.36', () => {
    const card = baseCard({ ease_factor: 2.5, interval_days: 1, review_state: 'new' });
    const r = sm2Review(card, 3);
    // From new/learning with interval <=1 → 6
    expect(r.interval_days).toBe(6);
    expect(r.review_state).toBe('learning'); // 6 <21 so learning, but our srs sets review only if >=21
    // Our implementation: review only if interval >=21, so 6 → learning
    expect(r.ease_factor).toBeCloseTo(2.36, 2);
    expect(r.reviews_correct).toBe(1);
  });

  it('grade 4: interval 6, ease 2.5 (no change for 4?) check formula', () => {
    const card = baseCard({ ease_factor: 2.5, interval_days: 1, review_state: 'learning' });
    const r = sm2Review(card, 4);
    expect(r.interval_days).toBe(6);
    // grade 4: ef = 2.5 +0.1 -1*(0.08+0.02)=2.5+0.1-0.1=2.5
    expect(r.ease_factor).toBeCloseTo(2.5, 2);
    expect(r.reviews_correct).toBe(1);
  });

  it('grade 5: perfect recall, interval 6, ease 2.6', () => {
    const card = baseCard({ ease_factor: 2.5, interval_days: 1, review_state: 'new' });
    const r = sm2Review(card, 5);
    expect(r.interval_days).toBe(6);
    expect(r.ease_factor).toBeCloseTo(2.6, 2);
    expect(r.reviews_correct).toBe(1);
  });

  it('grade 5 on interval 6 → interval ~15 (6*2.5)', () => {
    const card = baseCard({ ease_factor: 2.5, interval_days: 6, review_state: 'review' });
    const r = sm2Review(card, 5);
    expect(r.interval_days).toBe(15); // round(6*2.5)
    expect(r.ease_factor).toBeCloseTo(2.6, 2);
    expect(r.review_state).toBe('learning'); // 15<21
  });

  it('grade 5 on large interval → review state', () => {
    const card = baseCard({ ease_factor: 2.5, interval_days: 21, review_state: 'review' });
    const r = sm2Review(card, 5);
    // interval = round(21*2.5)=53
    expect(r.interval_days).toBe(53);
    expect(r.review_state).toBe('review'); // >=21
  });

  it('ease never drops below 1.3', () => {
    let card = baseCard({ ease_factor: 1.4, interval_days: 1, review_state: 'review' });
    for (let i = 0; i < 5; i++) {
      card = { ...card, ...sm2Review(card, 0) };
      expect(card.ease_factor).toBeGreaterThanOrEqual(1.3);
    }
  });

  it('reviews counters increment correctly', () => {
    const card = baseCard({ reviews_total: 2, reviews_correct: 1 });
    const rCorrect = sm2Review(card, 4);
    expect(rCorrect.reviews_total).toBe(3);
    expect(rCorrect.reviews_correct).toBe(2);
    const rWrong = sm2Review(card, 1);
    expect(rWrong.reviews_total).toBe(3);
    expect(rWrong.reviews_correct).toBe(1);
  });

  it('next_review_date is today + interval', () => {
    const card = baseCard({ interval_days: 1 });
    const before = new Date();
    const r = sm2Review(card, 5);
    const expected = new Date();
    expected.setDate(expected.getDate() + r.interval_days);
    const expectedStr = expected.toISOString().slice(0, 10);
    expect(r.next_review_date).toBe(expectedStr);
    expect(r.updated_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('interval branching: new card with grade 3/4/5 all go to 6', () => {
    for (const grade of [3, 4, 5]) {
      const r = sm2Review(baseCard({ interval_days: 1, review_state: 'new' }), grade);
      expect(r.interval_days).toBe(6);
    }
  });
});
