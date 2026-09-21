import { useQuery } from '@tanstack/react-query';
import { fetchMastery } from '@/features/mastery/api';
import { queryKeys } from './queryKeys';
import { cacheGet, cacheSet } from '@/lib/offline/cache';

export function useMastery(userId: string | undefined, opts?: { topic?: string; section?: string; limit?: number }) {
  return useQuery({
    queryKey: [...queryKeys.mastery(userId ?? '', opts?.topic, opts?.section), opts?.limit ?? 200] as const,
    enabled: !!userId,
    staleTime: 30_000,
    queryFn: async () => {
      const cacheKey = `mastery:${userId}:${opts?.topic ?? 'all'}:${opts?.section ?? 'all'}`;
      const doFetch = async () => {
        const res = await fetchMastery(userId!, opts);
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
        throw new Error('No cached mastery and offline');
      }
    },
  });
}
