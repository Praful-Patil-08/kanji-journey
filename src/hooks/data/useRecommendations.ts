import { useQuery } from '@tanstack/react-query';
import { fetchRecommendations } from '@/features/recommendations/api';
import { queryKeys } from './queryKeys';
import { cacheGet, cacheSet } from '@/lib/offline/cache';

export function useRecommendations(userId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.recommendations(userId ?? ''),
    enabled: !!userId,
    staleTime: 60_000,
    queryFn: async () => {
      const cacheKey = `rec:${userId}`;
      const doFetch = async () => {
        const res = await fetchRecommendations(userId!);
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
        throw new Error('No cached recommendations and offline');
      }
    },
  });
}
