import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { fetchPracticeAttempts, createPracticeAttempt, createPracticeAttemptsBatch } from '@/features/practice/api';
import type { PracticeAttemptPayload } from '@/features/practice/types';
import { queryKeys } from './queryKeys';

export function usePracticeAttempts(
  userId: string | undefined,
  opts?: { topic?: string; questionId?: string; limit?: number }
) {
  return useInfiniteQuery({
    queryKey: [...queryKeys.practiceAttempts(userId ?? '', opts?.topic, opts?.questionId), opts?.limit ?? 20] as const,
    enabled: !!userId,
    staleTime: 30_000,
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }) =>
      fetchPracticeAttempts(userId!, { ...opts, cursor: pageParam as string | null }),
    getNextPageParam: (lastPage) => lastPage.nextCursor,
  });
}

export function useCreatePracticeAttempt() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: PracticeAttemptPayload) => createPracticeAttempt(payload),
    onSuccess: (_, v) => {
      qc.invalidateQueries({ queryKey: queryKeys.practiceAttempts(v.user_id) });
      qc.invalidateQueries({ queryKey: queryKeys.practiceHistory(v.user_id) });
      qc.invalidateQueries({ queryKey: queryKeys.weakTopics(v.user_id) });
      qc.invalidateQueries({ queryKey: queryKeys.quizHistory(v.user_id) });
    },
  });
}

export function useCreatePracticeAttemptsBatch() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (attempts: PracticeAttemptPayload[]) => createPracticeAttemptsBatch(attempts),
    onSuccess: (_, attempts) => {
      const userId = attempts[0]?.user_id;
      if (!userId) return;
      qc.invalidateQueries({ queryKey: queryKeys.practiceAttempts(userId) });
      qc.invalidateQueries({ queryKey: queryKeys.practiceHistory(userId) });
      qc.invalidateQueries({ queryKey: queryKeys.weakTopics(userId) });
      qc.invalidateQueries({ queryKey: queryKeys.quizHistory(userId) });
    },
  });
}
