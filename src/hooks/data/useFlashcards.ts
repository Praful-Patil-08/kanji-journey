import { useQuery, useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/integrations/api/client';
import { queryKeys } from './queryKeys';
import { cacheGet, cacheSet } from '@/lib/offline/cache';
import { enqueue } from '@/lib/offline/queue';

export type FlashcardWithLegacy = {
  id: string;
  user_id: string;
  lesson_id: string | null;
  front: string;
  back: string;
  review_state: string;
  ease_factor: number;
  interval_days: number;
  next_review_date: string;
  reviews_total: number;
  reviews_correct: number;
  created_at: string;
  updated_at: string;
  // Legacy aliases used by components
  collection_id?: string | null;
  srs_level: number;
  next_review: string;
  hint: string;
};

function toLegacy(card: Omit<FlashcardWithLegacy, 'collection_id' | 'srs_level' | 'next_review' | 'hint'>): FlashcardWithLegacy {
  return {
    ...card,
    collection_id: null,
    srs_level: card.review_state === 'review' ? 3 : card.review_state === 'learning' ? 2 : 1,
    next_review: card.next_review_date,
    hint: card.back,
  };
}

export function useFlashcardsDue(userId: string | undefined, collectionId?: string | null) {
  return useQuery({
    queryKey: queryKeys.flashcardsDue(userId ?? '', collectionId),
    enabled: !!userId,
    staleTime: 60_000,
    queryFn: async () => {
      const cacheKey = `due:${userId}:${collectionId ?? 'all'}`;
      const doFetch = async () => {
        const path = `/api/flashcards/${userId}/due${collectionId ? `?collectionId=${collectionId}` : ''}`;
        const cards = await api.get<FlashcardWithLegacy[]>(path);
        const mapped = cards.map(toLegacy);
        await cacheSet('flashcards', cacheKey, mapped);
        return mapped;
      };
      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        const cached = await cacheGet<FlashcardWithLegacy[]>('flashcards', cacheKey);
        if (cached) return cached;
      }
      try {
        return await doFetch();
      } catch {
        const cached = await cacheGet<FlashcardWithLegacy[]>('flashcards', cacheKey);
        if (cached) return cached;
        throw new Error('No cached flashcards and offline');
      }
    },
  });
}

export function useFlashcards(userId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.flashcards(userId ?? ''),
    enabled: !!userId,
    staleTime: 60_000,
    queryFn: async () => {
      const cacheKey = `all:${userId}`;
      const doFetch = async () => {
        const cards = await api.get<FlashcardWithLegacy[]>(`/api/flashcards/${userId}`);
        const mapped = cards.map(toLegacy);
        await cacheSet('flashcards', cacheKey, mapped);
        return mapped;
      };
      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        const cached = await cacheGet<FlashcardWithLegacy[]>('flashcards', cacheKey);
        if (cached) return cached;
      }
      try {
        return await doFetch();
      } catch {
        const cached = await cacheGet<FlashcardWithLegacy[]>('flashcards', cacheKey);
        if (cached) return cached;
        throw new Error('No cached flashcards and offline');
      }
    },
  });
}

// Cursor-based infinite pagination for large decks (preferred for >100 cards)
export function useFlashcardsInfinite(userId: string | undefined, limit = 20) {
  return useInfiniteQuery({
    queryKey: [...queryKeys.flashcardsInfinite(userId ?? ''), limit] as const,
    enabled: !!userId,
    staleTime: 30_000,
    initialPageParam: null as string | null,
    queryFn: async ({ pageParam }) => {
      const qs = new URLSearchParams();
      qs.set('limit', String(limit));
      if (pageParam) qs.set('cursor', pageParam as string);
      const res = await api.get<{ data: FlashcardWithLegacy[]; nextCursor: string | null; hasMore: boolean }>(
        `/api/flashcards/${userId}?${qs.toString()}`
      );
      return { ...res, data: res.data.map(toLegacy) };
    },
    getNextPageParam: last => last.nextCursor,
  });
}

export function useFlashcardsDueInfinite(userId: string | undefined, limit = 20) {
  return useInfiniteQuery({
    queryKey: [...queryKeys.flashcardsDueInfinite(userId ?? ''), limit] as const,
    enabled: !!userId,
    staleTime: 30_000,
    initialPageParam: null as string | null,
    queryFn: async ({ pageParam }) => {
      const qs = new URLSearchParams();
      qs.set('limit', String(limit));
      if (pageParam) qs.set('cursor', pageParam as string);
      const res = await api.get<{ data: FlashcardWithLegacy[]; nextCursor: string | null; hasMore: boolean }>(
        `/api/flashcards/${userId}/due?${qs.toString()}`
      );
      return { ...res, data: res.data.map(toLegacy) };
    },
    getNextPageParam: last => last.nextCursor,
  });
}

export function useCreateFlashcard() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: {
      user_id: string;
      lesson_id?: string | null;
      front: string;
      back: string;
      next_review_date?: string;
      review_state?: string;
    }) => {
      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        enqueue('flashcard_create', payload);
        // Optimistic local card
        return {
          id: crypto.randomUUID(),
          user_id: payload.user_id,
          lesson_id: payload.lesson_id ?? null,
          front: payload.front,
          back: payload.back,
          review_state: 'new',
          ease_factor: 2.5,
          interval_days: 1,
          next_review_date: new Date().toISOString().slice(0, 10),
          reviews_total: 0,
          reviews_correct: 0,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          srs_level: 1,
          next_review: new Date().toISOString().slice(0, 10),
          hint: payload.back,
        } as FlashcardWithLegacy;
      }
      try {
        return await api.post<FlashcardWithLegacy>('/api/flashcards', payload);
      } catch (e) {
        if (typeof navigator !== 'undefined' && !navigator.onLine) {
          enqueue('flashcard_create', payload);
          throw new Error('Queued for sync when online');
        }
        throw e;
      }
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.flashcards(variables.user_id) });
    },
  });
}

export function useReviewFlashcard() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ cardId, grade, userId }: { cardId: string; grade: number; userId: string }) => {
      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        enqueue('flashcard_review', { cardId, grade, userId });
        // Optimistic: return minimal updated card
        return { id: cardId, review_state: grade >= 3 ? 'review' : 'learning' } as FlashcardWithLegacy;
      }
      try {
        return await api.post<FlashcardWithLegacy>(`/api/flashcards/${cardId}/review`, { grade });
      } catch (e) {
        if (typeof navigator !== 'undefined' && !navigator.onLine) {
          enqueue('flashcard_review', { cardId, grade, userId });
          throw new Error('Queued for sync when online');
        }
        throw e;
      }
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.flashcardsDue(variables.userId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.flashcards(variables.userId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.flashcardsInfinite(variables.userId) });
    },
  });
}
