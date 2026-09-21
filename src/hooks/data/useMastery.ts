import { useQuery } from '@tanstack/react-query';
import { fetchMastery } from '@/features/mastery/api';
import { queryKeys } from './queryKeys';

export function useMastery(userId: string | undefined, opts?: { topic?: string; section?: string; limit?: number }) {
  return useQuery({
    queryKey: [...queryKeys.mastery(userId ?? '', opts?.topic, opts?.section), opts?.limit ?? 200] as const,
    enabled: !!userId,
    staleTime: 30_000,
    queryFn: () => fetchMastery(userId!, opts),
  });
}
