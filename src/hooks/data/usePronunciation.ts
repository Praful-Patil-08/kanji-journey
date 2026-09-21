import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { fetchPronunciationHistory, fetchPronunciationStats, scorePronunciation } from '@/features/pronunciation/api';
import { queryKeys } from './queryKeys';

export function usePronunciationHistory(userId: string | undefined, targetText?: string, limit = 20) {
  return useInfiniteQuery({
    queryKey: [...queryKeys.pronunciationHistory(userId ?? '', targetText ?? null), limit] as const,
    enabled: !!userId,
    staleTime: 30_000,
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }) => fetchPronunciationHistory(userId!, { targetText, limit, cursor: pageParam as string | null }),
    getNextPageParam: last => last.nextCursor,
  });
}

export function usePronunciationStats(userId: string | undefined, targetText?: string) {
  return useQuery({
    queryKey: queryKeys.pronunciationStats(userId ?? '', targetText ?? null),
    enabled: !!userId,
    staleTime: 30_000,
    queryFn: () => fetchPronunciationStats(userId!, targetText),
  });
}

export function useScorePronunciation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: { audioBase64: string; targetText: string }) => scorePronunciation(payload),
    onSuccess: (data, variables) => {
      // Invalidate pronunciation history for this target
      // We don't have userId here, but we can invalidate broadly — the hook will refetch on next mount
      // For now, invalidate all pronunciation queries
      qc.invalidateQueries({ queryKey: ['pronunciationHistory'] });
      qc.invalidateQueries({ queryKey: ['pronunciationStats'] });
      qc.invalidateQueries({ queryKey: ['practiceAttempts'] });
    },
  });
}
