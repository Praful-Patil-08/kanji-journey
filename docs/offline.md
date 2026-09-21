# Offline Support

Kairo implements **practical offline-first** without a full sync engine. The goal is to let a learner continue a study session when temporarily offline (train, plane, poor Wi-Fi) and to sync when back online.

## What is cached

Via `src/lib/offline/cache.ts` (IndexedDB `kairo` DB, fallback to memory in tests):

| Store | Key example | Content | TTL |
|-------|-------------|---------|-----|
| `flashcards` | `all:${userId}`, `due:${userId}:all` | Flashcard arrays from `GET /api/flashcards/:userId` and `/due` | 24h |
| `progress` | `practiceAttempts:...`, `mastery:...`, `rec:...` | Practice attempts pages, mastery, recommendations | 24h |
| `lessons` | `collection:${id}` | Lesson lists (also has static fallback in `legacyCurriculum`) | 24h |
| `preferences` | `user:${userId}` | Not yet used (future: theme, daily goal) | 24h |

`STORES = ['lessons','flashcards','practiceQuestions','progress','preferences']`. Each entry is `{ key, value, timestamp, ttlMs }`. Expired entries are evicted on read.

`src/hooks/data/useCollections.ts` and `useLessons.ts` already have static fallbacks (`PLACEHOLDER_COLLECTIONS`, `STATIC_LESSONS`) so they work offline even without IndexedDB.

## What is queued

Via `src/lib/offline/queue.ts` (`localStorage kairo_offline_queue`, capped at 100, fallback to memory):

- `practice_attempt` / `practice_attempt_batch` → `POST /api/practice-attempts` / `/batch`
- `flashcard_create` → `POST /api/flashcards`
- `flashcard_review` → `POST /api/flashcards/:id/review`
- `lesson_progress` → `POST /api/lesson-progress`

Each item: `{ id, type, payload, timestamp, attempts }`. `attempts` is incremented on failure; items are dropped after 3 failures.

## Flow

```
Online
  fetch → cacheSet → render
  mutation → api.post → invalidate queries

Offline (navigator.onLine === false)
  fetch → cacheGet → render cached or throw "No cached ... and offline"
  mutation → enqueue + optimistic local card/attempt → toast "Queued for sync"

Back online
  window 'online' event → syncOfflineQueue() → for each queued item, api.post
  on success: dequeue, on failure: increment attempts (retry next online)
  onSync callback → toast + invalidate queries
```

`src/lib/offline/sync.ts` provides `syncOfflineQueue()` (called manually) and `initOfflineSync(onSync)` which listens to `'online'` and also tries immediately if `navigator.onLine && queue.length>0`.

`src/components/OfflineIndicator.tsx` is mounted in `App.tsx`. It:
- Shows a top amber banner when offline: "Offline — using cached data • changes will sync when back online"
- Shows a bottom pill when online but queue not empty: "N offline changes pending — will sync when online"
- Calls `initOfflineSync` on mount to auto-sync and toast on success.

`src/lib/offline/useOfflineStatus.ts` is a simple `navigator.onLine` listener for UI.

## Hooks integration

- `useFlashcards`, `useFlashcardsDue`: try `cacheGet` when `!navigator.onLine` or on fetch error, otherwise `cacheSet` after fetch.
- `usePracticeAttempts` (infinite): same pattern per page key.
- `useMastery`, `useRecommendations`: same pattern.
- `useCreateFlashcard`, `useReviewFlashcard`, `useCreatePracticeAttempt/Batch`: if `!navigator.onLine`, `enqueue` and return optimistic data; otherwise try `api.post`, and if it fails while offline, enqueue.

This keeps the offline implementation **small and reliable** — no CRDT, no conflict resolution, no background sync worker. For a flashcard app, last-write-wins is sufficient. If two devices edit the same flashcard offline, the server's `findOneAndUpdate` with `upsert` will keep the last write.

## Limitations

- No background sync service worker; sync only happens when the tab is open and the `online` event fires.
- No vector clock/conflict UI; duplicate flashcards are prevented by `user_id+front` unique index, so the second write is an upsert.
- Cache is per-browser, not cross-device. For cross-device, the user must be online to sync to MongoDB.
- `localStorage` queue is limited to ~5MB; we cap at 100 items to stay safe.

## Testing

`src/test/offline.test.ts` covers the pure logic:

- `cacheSet`/`cacheGet`/`cacheGetAll` with TTL and fallback
- `enqueue`/`getQueue`/`dequeue`/`clearQueue` and cap
- `syncOfflineQueue` with mocked `api`

The IndexedDB part is tested via the memory fallback (since Vitest runs in `happy-dom`/`node` without real IndexedDB).

## Future

- Replace `localStorage` queue with IndexedDB for larger payloads.
- Add a service worker to sync even when the tab is closed.
- Add per-store `lastSync` timestamps to show "cached 2h ago".
