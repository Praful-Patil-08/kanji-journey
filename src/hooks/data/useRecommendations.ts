import { useQuery } from '@tanstack/react-query';
import { fetchRecommendations } from '@/features/recommendations/api';
import { queryKeys } from './queryKeys';

export function useRecommendations(userId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.recommendations(userId ?? ''),
    enabled: !!userId,
    staleTime: 60_000,
    queryFn: () => fetchRecommendations(userId!),
  });
}
