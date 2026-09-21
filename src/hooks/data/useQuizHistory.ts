import { useQuery, useInfiniteQuery } from '@tanstack/react-query';
import { api } from '@/integrations/api/client';
import { queryKeys } from './queryKeys';

export interface QuizHistoryRow {
  id: string;
  created_at: string;
  type: string;
  score: number;
  duration_sec: number;
  lesson_id: string;
  lessons: { title: string } | null;
}

export function useQuizHistory(userId: string | undefined, limit = 20) {
  return useQuery({
    queryKey: queryKeys.quizHistory(userId ?? ''),
    enabled: !!userId,
    staleTime: 60_000,
    queryFn: () =>
      api.get<QuizHistoryRow[]>(`/api/quiz-history/${userId}?limit=${limit}`),
  });
}

// Cursor-based infinite pagination for large history (preferred)
export function useQuizHistoryInfinite(userId: string | undefined, limit = 20) {
  return useInfiniteQuery({
    queryKey: [...queryKeys.quizHistoryInfinite(userId ?? ''), limit] as const,
    enabled: !!userId,
    staleTime: 60_000,
    initialPageParam: null as string | null,
    queryFn: async ({ pageParam }) => {
      const qs = new URLSearchParams();
      qs.set('limit', String(limit));
      if (pageParam) qs.set('cursor', pageParam as string);
      const res = await api.get<{ data: QuizHistoryRow[]; nextCursor: string | null; hasMore: boolean }>(
        `/api/quiz-history/${userId}?${qs.toString()}`
      );
      return res;
    },
    getNextPageParam: last => last.nextCursor,
  });
}
