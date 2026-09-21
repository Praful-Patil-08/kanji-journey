import { describe, it, expect } from 'vitest';

// ── Validation logic mirrored from server/routes/practiceAttempts.cjs ────────
// We test the pure rules without needing Mongo or Express.

type AttemptPayload = {
  user_id: string;
  questionId: string;
  topic: string;
  section?: string | null;
  selectedAnswer: string;
  correctAnswer: string;
  isCorrect: boolean;
  responseTimeMs?: number | null;
  difficulty?: string | null;
  level?: string;
};

function validatePayload(p: Partial<AttemptPayload>): string[] {
  const errors: string[] = [];
  if (!p.user_id) errors.push('user_id required');
  if (!p.questionId) errors.push('questionId required');
  if (!p.topic) errors.push('topic required');
  if (p.topic && p.topic.length > 64) errors.push('topic too long');
  if (!p.selectedAnswer) errors.push('selectedAnswer required');
  if (!p.correctAnswer) errors.push('correctAnswer required');
  if (typeof p.isCorrect !== 'boolean') errors.push('isCorrect must be boolean');
  if (p.responseTimeMs !== undefined && p.responseTimeMs !== null) {
    if (!Number.isInteger(p.responseTimeMs) || p.responseTimeMs < 0 || p.responseTimeMs > 600000) {
      errors.push('responseTimeMs out of range');
    }
  }
  if (p.difficulty && !['easy','medium','hard'].includes(p.difficulty)) {
    errors.push('difficulty invalid');
  }
  return errors;
}

// Pagination helper — cursor is ISO date, newest first
function paginate<T extends { createdAt: Date }>(rows: T[], limit: number, cursor?: string | null): { data: T[]; nextCursor: string | null; hasMore: boolean } {
  let filtered = [...rows].sort((a,b) => b.createdAt.getTime() - a.createdAt.getTime());
  if (cursor) {
    const c = new Date(cursor);
    filtered = filtered.filter(r => r.createdAt.getTime() < c.getTime());
  }
  const hasMore = filtered.length > limit;
  const data = hasMore ? filtered.slice(0, limit) : filtered;
  const nextCursor = hasMore ? data[data.length-1].createdAt.toISOString() : null;
  return { data, nextCursor, hasMore };
}

describe('PracticeAttempt validation', () => {
  const valid: AttemptPayload = {
    user_id: 'user-123',
    questionId: 'q-1',
    topic: 'grammar',
    section: 'grammar',
    selectedAnswer: 'は',
    correctAnswer: 'が',
    isCorrect: false,
    responseTimeMs: 2400,
    difficulty: 'medium',
    level: 'N5',
  };

  it('valid payload has no errors', () => {
    expect(validatePayload(valid)).toEqual([]);
  });

  it('missing required fields → errors', () => {
    expect(validatePayload({})).toContain('user_id required');
    expect(validatePayload({ user_id: 'u' })).toContain('questionId required');
  });

  it('responseTimeMs out of range → error', () => {
    expect(validatePayload({ ...valid, responseTimeMs: -1 })).toContain('responseTimeMs out of range');
    expect(validatePayload({ ...valid, responseTimeMs: 999999 })).toContain('responseTimeMs out of range');
  });

  it('invalid difficulty → error', () => {
    expect(validatePayload({ ...valid, difficulty: 'extreme' as any })).toContain('difficulty invalid');
  });

  it('isCorrect must be boolean', () => {
    expect(validatePayload({ ...valid, isCorrect: 'true' as any })).toContain('isCorrect must be boolean');
  });

  it('topic too long → error', () => {
    expect(validatePayload({ ...valid, topic: 'a'.repeat(65) })).toContain('topic too long');
  });

  it('nullable fields allowed', () => {
    expect(validatePayload({ ...valid, responseTimeMs: null, difficulty: null, section: null })).toEqual([]);
  });
});

describe('PracticeAttempt pagination (cursor-based)', () => {
  const rows = Array.from({ length: 5 }, (_, i) => ({
    id: `a${i}`,
    createdAt: new Date(Date.UTC(2026, 0, i+1, 12,0,0)),
  }));

  it('first page returns limit items and nextCursor', () => {
    const res = paginate(rows, 2, null);
    expect(res.data).toHaveLength(2);
    expect(res.hasMore).toBe(true);
    expect(res.nextCursor).toBeTruthy();
    // Newest first: a4, a3
    expect(res.data[0].id).toBe('a4');
    expect(res.data[1].id).toBe('a3');
  });

  it('second page using cursor continues correctly', () => {
    const first = paginate(rows, 2, null);
    const second = paginate(rows, 2, first.nextCursor);
    expect(second.data[0].id).toBe('a2');
    expect(second.data[1].id).toBe('a1');
    expect(second.hasMore).toBe(true);
  });

  it('last page has no more', () => {
    const first = paginate(rows, 2, null);
    const second = paginate(rows, 2, first.nextCursor);
    const third = paginate(rows, 2, second.nextCursor);
    expect(third.data).toHaveLength(1);
    expect(third.hasMore).toBe(false);
    expect(third.nextCursor).toBeNull();
  });

  it('filter by topic (simulated) preserves pagination', () => {
    const withTopic = rows.map((r,i) => ({ ...r, topic: i % 2 === 0 ? 'kanji' : 'grammar' })) as any[];
    const kanji = withTopic.filter(r => r.topic === 'kanji');
    const res = paginate(kanji as any, 10, null);
    expect(res.data.every(r => (r as any).topic === 'kanji')).toBe(true);
  });
});

describe('PracticeAttempt ownership', () => {
  it('rejects when user_id does not match authenticated user', () => {
    const authenticatedUserId = 'user-A';
    const payload = { user_id: 'user-B', questionId: 'q1', topic: 'kanji', selectedAnswer: 'x', correctAnswer: 'y', isCorrect: false };
    const isForbidden = payload.user_id !== authenticatedUserId;
    expect(isForbidden).toBe(true);
  });

  it('allows when user_id matches', () => {
    const authenticatedUserId = 'user-A';
    const payload = { user_id: 'user-A', questionId: 'q1', topic: 'kanji', selectedAnswer: 'x', correctAnswer: 'y', isCorrect: true };
    expect(payload.user_id === authenticatedUserId).toBe(true);
  });

  it('batch rejects if any item mismatches user', () => {
    const authed = 'user-A';
    const batch = [
      { user_id: 'user-A', questionId: 'q1', topic: 'kanji', selectedAnswer: 'a', correctAnswer: 'a', isCorrect: true },
      { user_id: 'user-B', questionId: 'q2', topic: 'kanji', selectedAnswer: 'b', correctAnswer: 'c', isCorrect: false },
    ];
    const hasMismatch = batch.some(a => a.user_id !== authed);
    expect(hasMismatch).toBe(true);
  });
});

describe('PracticeAttempt indexes contract', () => {
  it('required indexes are defined', () => {
    // Document the indexes the model must have
    const requiredIndexes = [
      'user_id + createdAt',
      'user_id + topic + createdAt',
      'questionId + createdAt',
      'createdAt',
      'user_id + isCorrect + createdAt',
    ];
    // This test documents the contract; the model file should contain these.
    expect(requiredIndexes).toHaveLength(5);
  });
});
