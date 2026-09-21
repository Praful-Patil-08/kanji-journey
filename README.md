# Kairo — Adaptive Japanese Learning Platform

> Structured JLPT N5→N1 preparation with deterministic mastery, explainable recommendations, spaced repetition, and scoped RAG. Built for interview depth — a few features that can be explained, not a maximal checklist.

[![CI](https://github.com/Ninja-cloud-sorce/kanji-journey/actions/workflows/ci.yml/badge.svg)](https://github.com/Ninja-cloud-sorce/kanji-journey/actions)
[![Tests](https://img.shields.io/badge/tests-129%20passing-brightgreen)](#testing)
[![Stack](https://img.shields.io/badge/stack-React%2018%20·%20TypeScript%20·%20Express%20·%20MongoDB%20·%20Supabase-blue)](#tech-stack)

---

## Problem

Most Japanese apps show static lessons and treat progress as "completed". Kairo treats progress as **mastery**: it measures accuracy, recent accuracy, mistake frequency, response time, decay and SRS state per topic, then recommends the next session with a reason that can be explained in an interview.

## Architecture

```
React 18 (Vite, TypeScript, Tailwind, shadcn, Framer Motion)
  ↓  TanStack Query (server state, queryKeys factory, useInfiniteQuery) + Zustand (UI only)
  ↓  api/client.ts (fetch + Bearer JWT)
  ↓  Express 4 (Node, CommonJS) — /api/* — authSupabase, rateLimit, errorHandler
  ↓  Domain services (mastery, recommendation, RAG, SRS, OCR, dictionary)
  ↓  Mongoose (MongoDB Atlas) + Supabase Auth (JWT)
  ↓  Supabase Edge Function (Deno) → Gemini 2.0 Flash (fallback: static → HF → Groq/Claude)

Browser: IndexedDB (kairo, 24h TTL) + localStorage queue (offline)
Tests: Vitest (happy-dom), 129 tests
Deploy: Vercel (frontend), Render (backend), MongoDB Atlas, Supabase
```

See `docs/architecture.md`, `docs/data-model.md`, `docs/api.md`.

## Core Features (implemented)

- **Curriculum** — 21 static lessons (N5→N1) via `server/data/lessonCatalog.cjs`, mirrored in Supabase `lesson_catalog`. Collections: Hiragana, Katakana, Particle Logic, Verbal Rituals, Starter, Intermediate.
- **PracticeAttempt** — `POST /api/practice-attempts` and `/batch` store `userId, questionId, topic, section, selected/correct, isCorrect, responseTimeMs, difficulty, level, createdAt` with 5 indexes (user+createdAt, user+topic+createdAt, etc.) and cursor pagination `?cursor=ISO`.
- **Mastery Engine** — `server/services/mastery.cjs` (pure, no LLM): `accuracy, recentAccuracy (last 20), mistakeFrequency, avgResponseTime, lastSeen, decay (2%/day after 7d, floor 0.5), mastery = 0.6*accuracy+0.4*recent*decay`, weak if `total≥5 && (mastery<60 || accuracy<65 || recent<55)`.
- **Adaptive Recommendations** — `server/services/recommendation.cjs` (rule-based, explainable): SRS due (priority 1) → weak topics → recent mistakes → decay → JLPT level + `daily_goal_minutes`, each with `reasonDetail` (e.g., "Recommended because accuracy on particles dropped to 58% over last 20").
- **Adaptive Dashboard** — `Progress` and `Dashboard` use `useMastery`, `useRecommendations`, `useFlashcardsDue`, `useQuizHistory` to show overall + 5 skill bars, avg/recent accuracy, study time, SRS due, weak topics, improvement, next session. No fake fallbacks; empty state guides to practice.
- **SRS (SM-2)** — `server/services/srs.cjs` preserved, hardened: `ease 2.5, interval 1→6→×ease, floor 1.3`, `user_id+front` unique, `user_id+next_review_date` index, `FlashcardReview` history persisted, `POST /:cardId/review` feeds `PracticeAttempt` for mastery.
- **Pronunciation Analytics** — `POST /api/pronunciation/score` (HF `kotoba-whisper-v2.0` ASR, `similarityPercent`, `pitchAccentScore`) persists `PronunciationAttempt` (`user_id+targetText+createdAt`) when authenticated and feeds `PracticeAttempt` (listening). `GET /api/pronunciation/:userId` and `/stats` with cursor pagination; `PronunciationPractice` shows history and improvement.
- **Pagination** — Cursor (`?limit=20&cursor=ISO` → `{data, nextCursor, hasMore}`) for `flashcards`, `flashcards/due`, `quiz-history`, `practice-attempts`, `pronunciation`; `limit` 1-100, `user_id+createdAt/completed_at` indexes, no `skip`.
- **Offline** — `src/lib/offline/cache.ts` (IndexedDB `kairo`, 5 stores, 24h TTL, memory fallback) + `queue.ts` (`localStorage`, cap 100) + `sync.ts` (`initOfflineSync` on `online`), `OfflineIndicator` in `App.tsx`, hooks fallback to cache and enqueue when `!navigator.onLine`.
- **OCR → Kanji → Flashcard** — `POST /api/ocr` (`server/services/ocr.cjs`, pluggable: mock + HF TrOCR) → `detectKanji` (regex) → `lookupKanji` (Jisho + cache + `STATIC_DICT`) → up to 5 kanji cards → `Add to flashcards` → SRS. `OCRKanjiWorkflow` at `/ocr`.
- **Dictionary/Search** — `GET /api/dictionary/search?q=&limit=` and `GET /api/kanji/:character` (Jisho + 1h cache + static), `DictionarySearch` at `/dictionary`.

## Tech Stack

| Layer | Choice | Why |
|-------|--------|-----|
| Frontend | React 18, TypeScript, Vite 6, Tailwind, shadcn, Framer Motion | Existing, no rewrite to Flutter |
| State | TanStack Query (server), Zustand (UI) | Cache, infinite, invalidation via `queryKeys` |
| Backend | Express 4, CommonJS, Zod | Existing, no unnecessary rewrite |
| DB | MongoDB Atlas (Mongoose) + Supabase Auth | Keep existing split; no risky migration |
| Auth | Supabase JWT verified in `authSupabase` | `supabase.auth.getUser(token)` |
| AI | Gemini 2.0 Flash (Edge Function + Express `/api/chat/enhanced` with fallbacks) | Existing, add scoped RAG |
| SRS | SM-2 server | Deterministic, 6 grades |
| Tests | Vitest (happy-dom), jsdom→happy-dom for Node 26 | 129 tests, no snapshot abuse |
| Build | Vite 6 (manualChunks removed for Node 26) | Fixes hang at rendering chunks |

## System Architecture

```
React UI
  → Feature/application use case (src/features/*/api.ts)
  → Repository/service abstraction (hooks/data)
  → api/client.ts
  → Express API
  → Domain service (mastery, recommendation, RAG, SRS)
  → MongoDB/Supabase
```

For AI:

```
React (AIChatBubble sends history + currentPage/lessonId/topic + JWT)
  → Express /api/chat/enhanced (authSupabase)
  → fetch Profile + 20 attempts + dueCount → calculateMastery
  → retrieveRelevantLessons (≤3, keyword scoring) + buildLearnerContext (weak≤3, mistakes≤3)
  → buildScopedContext (800 tokens)
  → generateChatReply (Gemini, 700 tokens, static→HF→Groq/Claude)
  → persist chat_history
```

See `docs/ai-rag.md` for retrieval flow, security, token management, fallback, limitations and why RAG.

## Recommendation Engine

Explainable, rule-based, no LLM. See `docs/recommendation-engine.md` and `server/services/recommendation.cjs:1`.

## SRS

Preserved SM-2, see `docs/srs.md` and `server/services/srs.cjs:5`. Tests for grades 0-5 verify interval, ease, state, next_review_date, counters.

## Analytics

Every metric is from `PracticeAttempt`/`Flashcard`/`PronunciationAttempt`/`LessonProgress` — no fake `chartData` fallback. `Progress` shows `overall mastery, 5 skill bars, avg/recent accuracy, study time, SRS due, weak topics, improvement, next session`.

## Security

- Every user-specific route checks `req.userId === param/body user_id` else `403`; per-query `user_id` filter; never trust client `userId`.
- `authSupabase` on all `/api/*` (pronunciation score optionally persists only if authenticated).
- `express.json({limit:'25mb'})` for OCR, CORS allowlist, `rateLimit` (chat 20/min, pron 20/min, ocr 30/min), `errorHandler` never leaks stack, no `VITE_` secrets.

## Testing

```
Tests: 129 passing (vitest run) — 5-10 tests per domain
  - SM-2 (12), mastery (15), recommendation (9), RAG (12), pagination (9),
    practiceAttempt (15), pronunciation (10), OCR/dictionary (11), offline (10),
    scheduler, integration, example
Typecheck: tsc --noEmit pass
Lint: eslint (no-explicit-any off for portfolio, 0 errors, 13 warnings)
Build: vite build pass (2159 modules)
```

Run: `npm test` (vitest), `npm run lint`, `npx tsc --noEmit`, `npm run build`.

## CI/CD

`.github/workflows/ci.yml` — on `push/PR to main`: `npm ci → lint → typecheck → tests → build → verify dist/index.html` on Node 20, fails on any step.

## Screenshots / Demo

Add screenshots of Dashboard (mastery bars), Progress (analytics), OCR workflow, Dictionary, and a short demo video. (To be added after deploy.)

## Local Development

```bash
git clone https://github.com/Ninja-cloud-sorce/kanji-journey.git
cd kanji-journey
npm install
cp .env.example .env
# Fill: VITE_SUPABASE_URL, VITE_SUPABASE_PUBLISHABLE_KEY, VITE_API_BASE_URL=http://localhost:4000
#       MONGODB_URI, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, HF_API_TOKEN (optional for ASR/OCR), GEMINI_API_KEY (optional)
npm run dev:full   # Vite :8080 + Express :4000
# Or: npm run dev, npm run server
npm test
npm run build
```

## Environment Variables

| Var | Where | Required |
|-----|-------|----------|
| `VITE_SUPABASE_URL` | frontend | yes |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | frontend | yes |
| `VITE_API_BASE_URL` | frontend | yes (default http://localhost:4000) |
| `MONGODB_URI` | backend | yes |
| `SUPABASE_URL` | backend | yes |
| `SUPABASE_SERVICE_ROLE_KEY` | backend | yes |
| `HF_API_TOKEN` | backend | no (ASR/OCR, otherwise 503) |
| `HF_JA_ASR_MODEL` | backend | no (default `kotoba-tech/kotoba-whisper-v2.0`) |
| `HF_OCR_MODEL` | backend | no (default `microsoft/trocr-base-printed`) |
| `GEMINI_API_KEY` | backend/Edge | no (fallback to mock/static) |
| `FRONTEND_URL` | backend | no (CORS allowlist) |

See `.env.example`.

## API Overview

See `docs/api.md` for full. Key:

| Method | Path | Auth |
|--------|------|------|
| GET | `/health` | no |
| GET/PUT | `/api/profiles/:userId` | yes |
| GET | `/api/collections`, `/api/lessons?collectionId=` | yes |
| POST | `/api/practice-attempts`, `/batch` | yes |
| GET | `/api/practice-attempts/:userId?cursor=&limit=` | yes |
| GET | `/api/mastery/:userId` | yes |
| GET | `/api/recommendations/:userId` | yes |
| POST | `/api/flashcards`, `POST /:cardId/review` | yes |
| GET | `/api/flashcards/:userId?cursor=&limit=`, `/due` | yes |
| POST | `/api/pronunciation/score` | optional (persist if auth) |
| GET | `/api/pronunciation/:userId`, `/stats` | yes |
| POST | `/api/ocr` | yes |
| GET | `/api/dictionary/search`, `/api/kanji/:character` | yes |
| POST | `/api/chat/enhanced` | yes (scoped RAG) |

All cursor pagination: `?limit=20&cursor=ISO` → `{data, nextCursor, hasMore}`.

## Project Structure

```
kanji-journey/
  src/
    components/      # Dashboard, Progress (adaptive), FlashcardSession, OCR, Dictionary, OfflineIndicator, AIChatBubble (scoped)
    features/        # practice, mastery, recommendations, pronunciation (types+api)
    hooks/data/      # useMastery, useRecommendations, usePracticeAttempts (infinite), useFlashcards (infinite), useQuizHistory, usePronunciation, queryKeys
    lib/offline/     # cache.ts (IndexedDB), queue.ts, sync.ts, useOfflineStatus
    integrations/    # api/client, supabase/client
    test/            # 129 tests (scheduler, srsReview, mastery, recommendation, RAG, pagination, offline, pronunciation, ocrDictionary)
  server/
    app.cjs          # Express, CORS, rateLimit, routes, notFound/errorHandler
    middleware/      # authSupabase, errorHandler, rateLimit
    models/          # Profile, LessonProgress, Flashcard, FlashcardReview, PracticeAttempt, PronunciationAttempt, WeakTopic
    routes/          # profiles, flashcards, practiceAttempts (cursor), mastery, recommendations, pronunciation, ocr, dictionary, chat (RAG)
    services/        # srs, mastery, recommendation, rag, ocr, dictionary
    data/            # lessonCatalog (21 lessons)
  supabase/
    migrations/      # 001..010, lesson_catalog, profiles, etc.
    functions/chat/  # Edge Function (Gemini)
  docs/              # architecture, data-model, api, ai-rag, offline, srs, recommendation-engine
  .github/workflows/ci.yml
```

## Future Improvements (intentionally not built)

- Vector RAG (pgvector/Atlas Vector) for large lesson corpus (currently keyword scoring, sufficient for 21 lessons).
- Service worker background sync (currently `online` event only).
- Full offline CRDT for multi-device flashcards (currently last-write-wins, `user_id+front` unique).
- Tesseract.js in-browser OCR for fully offline Kanji detection.

## Decisions

See `docs/architecture.md` for full table (Why MongoDB vs Supabase, Why TanStack Query, Why SM-2, Why server-side recommendation, Why RAG with 800-token cap, Why cursor pagination, Why IndexedDB).

## License

MIT
