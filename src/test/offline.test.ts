// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { cacheSet, cacheGet, cacheGetAll, _resetMemoryFallback } from '@/lib/offline/cache';
import { enqueue, getQueue, clearQueue, _resetQueue } from '@/lib/offline/queue';

describe('offline cache', () => {
  beforeEach(() => {
    _resetMemoryFallback();
    _resetQueue();
    // Ensure IndexedDB not available in happy-dom node -> fallback to memory
  });

  it('cacheSet and cacheGet round-trip', async () => {
    await cacheSet('flashcards', 'all:user123', [{ id: 'c1' }]);
    const val = await cacheGet<any>('flashcards', 'all:user123');
    expect(val).toEqual([{ id: 'c1' }]);
  });

  it('cacheGet returns null for missing key', async () => {
    const val = await cacheGet('flashcards', 'missing');
    expect(val).toBeNull();
  });

  it('cacheGetAll returns all entries', async () => {
    await cacheSet('progress', 'k1', { a: 1 });
    await cacheSet('progress', 'k2', { b: 2 });
    const all = await cacheGetAll<any>('progress');
    expect(all.length).toBe(2);
  });

  it('respects TTL (expired entries evicted)', async () => {
    await cacheSet('flashcards', 'k1', { v: 1 }, 10); // 10ms TTL
    // Immediately should exist
    expect(await cacheGet('flashcards', 'k1')).toEqual({ v: 1 });
    await new Promise(r => setTimeout(r, 20));
    expect(await cacheGet('flashcards', 'k1')).toBeNull();
  });
});

describe('offline queue', () => {
  beforeEach(() => {
    _resetQueue();
  });

  it('enqueue adds item and getQueue returns it', () => {
    const item = enqueue('practice_attempt', { questionId: 'q1' });
    expect(item.type).toBe('practice_attempt');
    expect(item.id).toBeTruthy();
    const q = getQueue();
    expect(q).toHaveLength(1);
    expect(q[0].id).toBe(item.id);
  });

  it('caps at 100', () => {
    for (let i = 0; i < 105; i++) enqueue('practice_attempt', { i });
    expect(getQueue().length).toBe(100);
    expect(getQueue()[0].payload.i).toBe(5); // first 5 evicted
  });

  it('clearQueue empties', () => {
    enqueue('flashcard_review', { cardId: 'c1' });
    clearQueue();
    expect(getQueue()).toHaveLength(0);
  });

  it('enqueue flashcard_create and lesson_progress', () => {
    enqueue('flashcard_create', { front: 'a' });
    enqueue('lesson_progress', { lesson_id: 'n5-w1-l1' });
    const q = getQueue();
    expect(q.some(i => i.type === 'flashcard_create')).toBe(true);
    expect(q.some(i => i.type === 'lesson_progress')).toBe(true);
  });
});

describe('offline queue sync', () => {
  beforeEach(() => {
    _resetQueue();
  });

  it('syncs via api when online (mocked)', async () => {
    // Mock api.post to succeed
    const api = await import('@/integrations/api/client');
    const spy = vi.spyOn(api.api, 'post').mockResolvedValue({ ok: true } as any);

    enqueue('practice_attempt', { user_id: 'u1', questionId: 'q1', topic: 'kanji', selectedAnswer: 'a', correctAnswer: 'b', isCorrect: true });
    const { syncOfflineQueue } = await import('@/lib/offline/sync');
    const result = await syncOfflineQueue();
    expect(result.succeeded).toBe(1);
    expect(result.remaining).toBe(0);
    expect(getQueue().length).toBe(0);
    spy.mockRestore();
  });

  it('keeps failed items for retry', async () => {
    const api = await import('@/integrations/api/client');
    const spy = vi.spyOn(api.api, 'post').mockRejectedValue(new Error('network'));

    enqueue('practice_attempt', { user_id: 'u1', questionId: 'q1', topic: 'kanji', selectedAnswer: 'a', correctAnswer: 'b', isCorrect: true });
    const { syncOfflineQueue } = await import('@/lib/offline/sync');
    const result = await syncOfflineQueue();
    expect(result.failed).toBe(1);
    expect(getQueue().length).toBe(1);
    expect(getQueue()[0].attempts).toBe(1);
    spy.mockRestore();
  });
});
