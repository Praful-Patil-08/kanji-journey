# Kairo Architecture

## Overview

Kairo is a full-stack Japanese learning platform with deterministic mastery and recommendation engines, spaced repetition, and scoped RAG. The architecture is intentionally **small and deep** — a few services that can be explained in an interview, not a maximal feature list.

## High-Level

```
React 18 (Vite, TypeScript, Tailwind, shadcn, Framer Motion)
  ↓  TanStack Query (server state) + Zustand (UI only)
  ↓  api/client.ts (fetch + Bearer JWT)
  ↓  Express 4 (Node, CommonJS) — /api/*
  ↓  Domain services (mastery, recommendation, RAG, SRS)
  ↓  Mongoose (MongoDB Atlas)  +  Supabase Auth (JWT)
  ↓  Supabase Edge Function (Deno) → Gemini (fallback: static → HF → Groq/Claude)

Browser cache: IndexedDB (kairo) + localStorage queue (offline)
Tests: Vitest (happy-dom) + jsdom/happy-dom, 129 tests
Deploy: Vercel (frontend), Render/Fly (backend), MongoDB Atlas, Supabase
```

## Frontend

`src/` is organized by feature, not by type, where it adds separation:

```
src/
  components/         # Dashboard, Progress, LessonDetail, FlashcardSession, OCR, Dictionary, OfflineIndicator
  features/
    practice/         # api.ts, types.ts (PracticeAttempt)
    mastery/          # api.ts, types.ts
    recommendations/  # api.ts, types.ts
    pronunciation/    # api.ts, types.ts
  hooks/data/          # useMastery, useRecommendations, usePracticeAttempts (infinite), useFlashcards, useQuizHistory, usePronunciation, queryKeys (factory)
  lib/
    offline/          # cache.ts (IndexedDB), queue.ts (localStorage), sync.ts, useOfflineStatus.ts
  integrations/
    api/client.ts     # apiRequest with getAuthToken()
    supabase/client.ts
  context/            # AuthContext (Supabase session → Profile), AppPreferencesContext
```

- **State:** TanStack Query for all server data (staleTime 30-60s, `queryKeys` factory, `useInfiniteQuery` for cursor pagination). Zustand only for ephemeral UI (`useStore`).
- **Routing:** React Router v6, lazy `import()` for code-splitting (Dashboard, Library, Progress, sessions, OCR/Dictionary).
- **Offline:** `cacheSet/cacheGet` (IndexedDB) on fetch, `enqueue` when `!navigator.onLine`, `initOfflineSync` on `online` event.

## Backend

```
server/
  app.cjs             # Express, CORS, JSON 25mb, cookieParser, request log, rateLimit, routes, notFound/errorHandler
  db.cjs              # mongoose.connect, bufferCommands false
  middleware/
    authSupabase.cjs  # verifies Bearer JWT via supabase.auth.getUser(token), sets req.userId
    errorHandler.cjs  # { error, code } never leaks stack
    rateLimit.cjs     # in-memory per-IP (chat 20/min, pron 20/min, ocr 30/min)
  models/
    Profile.cjs, LessonProgress.cjs, Flashcard.cjs, FlashcardReview.cjs, WeakTopic.cjs, PracticeAttempt.cjs, PronunciationAttempt.cjs
  routes/
    profiles, collections, lessons, lessonProgress, flashcards (+ due + history), weakTopics, completions, quizHistory (cursor), practiceAttempts (cursor), mastery, recommendations, pronunciation (history+stats), ocr, dictionary, chat (scoped RAG)
  services/
    srs.cjs           # sm2Review
    mastery.cjs       # calculateTopicStats, calculateMastery
    recommendation.cjs# generateRecommendations
    rag.cjs           # retrieveRelevantLessons, buildLearnerContext, buildScopedContext
    ocr.cjs           # recognize, detectKanji (pluggable)
    dictionary.cjs    # Jisho + cache + static fallback
  data/
    lessonCatalog.cjs # static 21 lessons, collections
```

## Data Flow — Learning

```
User answers quiz
  → useSavePracticeAnswer → POST /api/practice-attempts (or queue if offline)
  → PracticeAttempt stored (user_id+createdAt index)
  → mastery recalculates: accuracy, recentAccuracy (last 20), decay (2%/day after 7d), mastery = 0.6*acc+0.4*recent * decay
  → weakTopics (mastery<60)
  → recommendations: due SRS (first), weak topics, recent mistakes, decay, JLPT level, daily_goal
  → dashboard/progress shows overall + 5 skill bars + weak pills + next session (reasonDetail)
```

## Data Flow — SRS

```
Wrong answer in complete-lesson
  → Flashcard upsert (user_id+front unique)
  → SM-2 on review: interval 1→6→×ease, ease ±0.1-0.2, floor 1.3, state new/learning/review
  → FlashcardReview persisted + PracticeAttempt fed for mastery
  → due query: user_id+next_review_date ≤ today, indexed
```

## Data Flow — AI/RAG

See `docs/ai-rag.md` for full. Summary:

```
AIChatBubble sends { message, history (≤8), currentPage, currentLessonId, currentTopic } + JWT
  → authSupabase → fetch Profile + 20 attempts + dueCount → calculateMastery
  → retrieveRelevantLessons (≤3, keyword scoring) + buildLearnerContext (weak ≤3, mistakes ≤3)
  → buildScopedContext (800 tokens)
  → generateChatReply (Gemini 2.0 Flash, 700 tokens, static→HF→Groq/Claude fallback)
  → persist chat_history
```

## Data Flow — Offline

```
Online: fetch → cacheSet → render; mutation → api.post → invalidate
Offline: fetch → cacheGet (IndexedDB) or static fallback; mutation → enqueue + optimistic
Back online: 'online' event → syncOfflineQueue() → api.post for each, dequeue on success
```

## Decisions

| Problem | Decision | Alternative | Reason | Trade-off |
|---------|----------|-------------|--------|-----------|
| DB | MongoDB Atlas + Mongoose | Supabase Postgres for all | Keep existing, no migration risk, flexible schema for attempts | Two sources (Auth in Supabase, data in Mongo) |
| Auth | Supabase Auth + JWT verification in Express | Custom JWT | No need to run auth server, free, battle-tested | Need service_role key on server |
| State | TanStack Query | Redux | Server-state as cache with staleTime, infinite pagination, auto invalidation | Learning curve |
| SRS | SM-2 (server) | Leitner, FSRS | Well-known, easy to explain, deterministic, 6 grades | Not latest research |
| Mastery | Pure arithmetic, no LLM | LLM summary | Deterministic, testable, cheap | Less "AI" buzz |
| Recommendations | Rule-based, explainable | LLM | Explainable `reasonDetail`, no hallucination, deterministic | Hand-tuned |
| RAG | Keyword scoring, 800-token cap | Vector DB | No infra, explainable, sufficient for 21 lessons | Needs vectors for large corpus |
| Pagination | Cursor (`created_at < cursor`) | Offset `skip` | O(log n) via index, stable when new data arrives | Client must handle cursor |
| Offline | IndexedDB + localStorage queue, last-write-wins | CRDT, service worker | Small, reliable, sufficient for flashcards | No cross-tab sync, cap 100 |
| Build | Vite 6 + happy-dom (Vitest) | Vite 5 + jsdom | Vite 5 + Node 26 hangs at `manualChunks`; happy-dom handles `localStorage` in tests | Need to migrate off jsdom |
| Chat | Express `/api/chat/enhanced` (primary) + Edge Function (fallback) | Only Edge | Express can join MongoDB (attempts, mastery) with catalog; Edge only sees Supabase | Two implementations to keep in sync |

## Scaling

- **Indexes:** `practice_attempts` (user+createdAt, user+topic+createdAt, user+isCorrect+createdAt), `flashcards` (user+front unique, user+next_review_date, user+createdAt), `lesson_progress` (user+completed+completed_at), `pronunciation_attempts` (user+targetText+createdAt). All support pagination and mastery without collection scans.
- **Pagination:** Prefer cursor (`?limit=20&cursor=ISO`) for `flashcards`, `quiz-history`, `practice-attempts`, `pronunciation`. `limit` capped 1-100.
- **Caching:** IndexedDB 24h TTL for lessons/flashcards/progress, `staleTime` 30-60s in Query, `placeholderData` for collections.
- **Rate limiting:** in-memory per-IP for chat/pron/ocr.

## Testing & CI

- `vitest` (happy-dom, `setup.ts` guards `window`), 129 tests (SM-2, mastery, recommendation, RAG, pagination, offline, pronunciation, OCR).
- `tsc --noEmit`, `eslint` (no-explicit-any off for portfolio), `vite build` (2154 modules).
- `/.github/workflows/ci.yml` — `npm ci → lint → typecheck → tests → build → verify dist/index.html` on Node 20, fails on any step.

## Security

- `authSupabase` on every user-specific route, `req.userId` is source of truth, 403 on mismatch, per-query `user_id` filter.
- No `userId` trusted from body alone.
- `express.json({limit: '25mb'})` for OCR images, CORS allowlist + dev localhost, `rateLimit` for expensive endpoints, `errorHandler` never leaks stack.
- No secrets in `VITE_` vars; `GEMINI_API_KEY`, `MONGODB_URI`, `SUPABASE_SERVICE_ROLE_KEY` server-only.

## Future (intentionally not built)

- Vector RAG (pgvector/Atlas Vector) for large lesson corpus.
- Service worker background sync.
- Full offline CRDT for multi-device flashcards.

```
