import { api } from '@/integrations/api/client';
import type { PracticeAttempt, PracticeAttemptPage, PracticeAttemptPayload } from './types';

export async function createPracticeAttempt(payload: PracticeAttemptPayload): Promise<PracticeAttempt> {
  return api.post<PracticeAttempt>('/api/practice-attempts', payload);
}

export async function createPracticeAttemptsBatch(attempts: PracticeAttemptPayload[]): Promise<{ inserted: number; ids: string[] }> {
  return api.post('/api/practice-attempts/batch', { attempts });
}

export async function fetchPracticeAttempts(
  userId: string,
  opts?: { topic?: string; questionId?: string; limit?: number; cursor?: string | null }
): Promise<PracticeAttemptPage> {
  const params = new URLSearchParams();
  if (opts?.topic) params.set('topic', opts.topic);
  if (opts?.questionId) params.set('questionId', opts.questionId);
  if (opts?.limit) params.set('limit', String(opts.limit));
  if (opts?.cursor) params.set('cursor', opts.cursor);
  const qs = params.toString();
  return api.get<PracticeAttemptPage>(`/api/practice-attempts/${userId}${qs ? `?${qs}` : ''}`);
}
