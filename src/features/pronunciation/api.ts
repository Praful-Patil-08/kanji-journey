import { api } from '@/integrations/api/client';
import type { PronunciationHistoryPage, PronunciationStats, PronunciationScoreResponse } from './types';

export function fetchPronunciationHistory(
  userId: string,
  opts?: { targetText?: string; limit?: number; cursor?: string | null }
): Promise<PronunciationHistoryPage> {
  const qs = new URLSearchParams();
  if (opts?.targetText) qs.set('targetText', opts.targetText);
  if (opts?.limit) qs.set('limit', String(opts.limit));
  if (opts?.cursor) qs.set('cursor', opts.cursor);
  const q = qs.toString();
  return api.get<PronunciationHistoryPage>(`/api/pronunciation/${userId}${q ? `?${q}` : ''}`);
}

export function fetchPronunciationStats(userId: string, targetText?: string): Promise<PronunciationStats> {
  const qs = targetText ? `?targetText=${encodeURIComponent(targetText)}` : '';
  return api.get<PronunciationStats>(`/api/pronunciation/${userId}/stats${qs}`);
}

export function scorePronunciation(payload: { audioBase64: string; targetText: string }): Promise<PronunciationScoreResponse> {
  return api.post<PronunciationScoreResponse>('/api/pronunciation/score', payload);
}
