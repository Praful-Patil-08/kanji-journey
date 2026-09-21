/**
 * Sync offline queue when back online.
 * Each queued mutation is replayed via the API. Failures are kept for retry (max 3 attempts).
 */

import { api } from '@/integrations/api/client';
import { getQueue, dequeue, updateAttempts } from './queue';

export type SyncResult = {
  succeeded: number;
  failed: number;
  remaining: number;
};

export async function syncOfflineQueue(): Promise<SyncResult> {
  const queue = getQueue();
  if (queue.length === 0) return { succeeded: 0, failed: 0, remaining: 0 };

  let succeeded = 0;
  let failed = 0;

  for (const item of [...queue]) {
    // Skip if too many attempts
    if (item.attempts >= 3) {
      dequeue(item.id);
      failed += 1;
      continue;
    }

    try {
      switch (item.type) {
        case 'practice_attempt':
          await api.post('/api/practice-attempts', item.payload);
          break;
        case 'practice_attempt_batch':
          await api.post('/api/practice-attempts/batch', item.payload);
          break;
        case 'flashcard_review':
          await api.post(`/api/flashcards/${item.payload.cardId}/review`, { grade: item.payload.grade });
          break;
        case 'lesson_progress':
          await api.post('/api/lesson-progress', item.payload);
          break;
        case 'flashcard_create':
          await api.post('/api/flashcards', item.payload);
          break;
        default:
          // Unknown type — drop
          dequeue(item.id);
          continue;
      }
      dequeue(item.id);
      succeeded += 1;
    } catch (e) {
      updateAttempts(item.id);
      failed += 1;
      // Keep in queue for next sync, unless we want to drop after 3
      console.warn('[offline sync] failed for', item.type, (e as Error).message);
    }
  }

  return { succeeded, failed, remaining: getQueue().length };
}

// Auto-sync when coming back online
let isListening = false;
export function initOfflineSync(onSync?: (result: SyncResult) => void): () => void {
  if (isListening || typeof window === 'undefined') return () => {};
  isListening = true;

  const handler = async () => {
    if (navigator.onLine) {
      const result = await syncOfflineQueue();
      if (result.succeeded > 0 || result.failed > 0) {
        onSync?.(result);
      }
    }
  };

  window.addEventListener('online', handler);
  // Also try immediately if already online and queue not empty
  if (navigator.onLine && getQueue().length > 0) {
    // Defer to next tick to avoid blocking
    setTimeout(handler, 1000);
  }

  return () => {
    window.removeEventListener('online', handler);
    isListening = false;
  };
}
