import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { fetchPracticeAttempts, createPracticeAttempt, createPracticeAttemptsBatch } from '@/features/practice/api';
import type { PracticeAttemptPayload } from '@/features/practice/types';
import { queryKeys } from './queryKeys';
import { enqueue } from '@/lib/offline/queue';
import { cacheGet, cacheSet } from '@/lib/offline/cache';

export function usePracticeAttempts(
  userId: string | undefined,
  opts?: { topic?: string; questionId?: string; limit?: number }
) {
  return useInfiniteQuery({
    queryKey: [...queryKeys.practiceAttempts(userId ?? '', opts?.topic, opts?.questionId), opts?.limit ?? 20] as const,
    enabled: !!userId,
    staleTime: 30_000,
    initialPageParam: null as string | null,
    queryFn: async ({ pageParam }) => {
      const cacheKey = `practiceAttempts:${userId}:${opts?.topic ?? 'all'}:${opts?.questionId ?? 'all'}:${pageParam ?? 'first'}`;
      const doFetch = async () => {
        const res = await fetchPracticeAttempts(userId!, { ...opts, cursor: pageParam as string | null });
        await cacheSet('progress', cacheKey, res);
        return res;
      };
      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        const cached = await cacheGet<any>('progress', cacheKey);
        if (cached) return cached;
      }
      try {
        return await doFetch();
      } catch {
        const cached = await cacheGet<any>('progress', cacheKey);
        if (cached) return cached;
        throw new Error('No cached practice attempts and offline');
      }
    },
    getNextPageParam: (lastPage) => lastPage.nextCursor,
  });
}

export function useCreatePracticeAttempt() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: PracticeAttemptPayload) => {
      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        enqueue('practice_attempt', payload);
        return { id: crypto.randomUUID(), ...payload, createdAt: new Date().toISOString() } as any;
      }
      try {
        return await createPracticeAttempt(payload);
      } catch (e) {
        if (typeof navigator !== 'undefined' && !navigator.onLine) {
          enqueue('practice_attempt', payload);
          throw new Error('Queued for sync when online');
        }
        throw e;
      }
    },
    onSuccess: (_, v) => {
      qc.invalidateQueries({ queryKey: queryKeys.practiceAttempts(v.user_id) });
      qc.invalidateQueries({ queryKey: queryKeys.practiceHistory(v.user_id) });
      qc.invalidateQueries({ queryKey: queryKeys.weakTopics(v.user_id) });
      qc.invalidateQueries({ queryKey: queryKeys.quizHistory(v.user_id) });
      qc.invalidateQueries({ queryKey: queryKeys.mastery(v.user_id) });
      qc.invalidateQueries({ queryKey: queryKeys.recommendations(v.user_id) });
    },
  });
}

export function useCreatePracticeAttemptsBatch() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (attempts: PracticeAttemptPayload[]) => {
      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        enqueue('practice_attempt_batch', { attempts });
        return { inserted: attempts.length, ids: attempts.map(() => crypto.randomUUID()) } as any;
      }
      try {
        return await createPracticeAttemptsBatch(attempts);
      } catch (e) {
        if (typeof navigator !== 'undefined' && !navigator.onLine) {
          enqueue('practice_attempt_batch', { attempts });
          throw new Error('Queued for sync when online');
        }
        throw e;
      }
    },
    onSuccess: (_, attempts) => {
      const userId = attempts[0]?.user_id;
      if (!userId) return;
      qc.invalidateQueries({ queryKey: queryKeys.practiceAttempts(userId) });
      qc.invalidateQueries({ queryKey: queryKeys.practiceHistory(userId) });
      qc.invalidateQueries({ queryKey: queryKeys.weakTopics(userId) });
      qc.invalidateQueries({ queryKey: queryKeys.quizHistory(userId) });
      qc.invalidateQueries({ queryKey: queryKeys.mastery(userId) });
      qc.invalidateQueries({ queryKey: queryKeys.recommendations(userId) });
    },
  });
}
