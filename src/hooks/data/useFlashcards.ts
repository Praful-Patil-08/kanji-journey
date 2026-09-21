import { useQuery, useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/integrations/api/client';
import { queryKeys } from './queryKeys';

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
      const path = `/api/flashcards/${userId}/due${collectionId ? `?collectionId=${collectionId}` : ''}`;
      const cards = await api.get<FlashcardWithLegacy[]>(path);
      return cards.map(toLegacy);
    },
  });
}

export function useFlashcards(userId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.flashcards(userId ?? ''),
    enabled: !!userId,
    staleTime: 60_000,
    queryFn: async () => {
      const cards = await api.get<FlashcardWithLegacy[]>(`/api/flashcards/${userId}`);
      return cards.map(toLegacy);
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
      return api.post<FlashcardWithLegacy>('/api/flashcards', payload);
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
      return api.post<FlashcardWithLegacy>(`/api/flashcards/${cardId}/review`, { grade });
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.flashcardsDue(variables.userId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.flashcards(variables.userId) });
    },
  });
}
