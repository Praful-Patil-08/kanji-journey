import { useQuery } from '@tanstack/react-query';
import { api } from '@/integrations/api/client';
import { queryKeys } from './queryKeys';
import { getLegacyCollectionMeta, STATIC_LESSONS } from '@/lib/legacyCurriculum';

export interface Lesson {
  id: string;
  collection_id: string;
  title: string;
  subtitle: string;
  characters: string[];
  sort_order: number;
  content: any;
  status?: 'COMPLETED' | 'CURRENT' | 'LOCKED';
}

export function useLessons(collectionId: string | null, userId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.lessons(collectionId ?? '', userId ?? ''),
    enabled: !!collectionId,
    staleTime: 30_000,
    queryFn: async () => {
      try {
        const path = `/api/lessons?collectionId=${encodeURIComponent(collectionId!)}${userId ? `&userId=${userId}` : ''}`;
        const rows = await api.get<Lesson[]>(path);
        if (rows && rows.length > 0) return rows;
      } catch {
        // fall through to static fallback
      }
      return (STATIC_LESSONS[collectionId!] ?? []).map(l => ({ ...l, status: 'CURRENT' as const }));
    },
  });
}

export function useCollectionDetail(collectionId: string | null) {
  return useQuery({
    queryKey: queryKeys.collectionDetail(collectionId ?? ''),
    enabled: !!collectionId,
    staleTime: 60_000,
    queryFn: async () => {
      try {
        return await api.get<{ id: string; title: string; subtitle: string; icon: string; description: string; level: string }>(
          `/api/collections/${collectionId}`
        );
      } catch {
        return getLegacyCollectionMeta(collectionId!);
      }
    },
  });
}
