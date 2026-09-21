import { api } from '@/integrations/api/client';
import type { RecommendationResponse } from './types';

export function fetchRecommendations(userId: string): Promise<RecommendationResponse> {
  return api.get<RecommendationResponse>(`/api/recommendations/${userId}`);
}
