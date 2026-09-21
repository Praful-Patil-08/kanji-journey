import { api } from '@/integrations/api/client';
import type { MasteryResponse } from './types';

export function fetchMastery(userId: string, opts?: { topic?: string; section?: string; limit?: number }): Promise<MasteryResponse> {
  const params = new URLSearchParams();
  if (opts?.topic) params.set('topic', opts.topic);
  if (opts?.section) params.set('section', opts.section);
  if (opts?.limit) params.set('limit', String(opts.limit));
  const qs = params.toString();
  return api.get<MasteryResponse>(`/api/mastery/${userId}${qs ? `?${qs}` : ''}`);
}
