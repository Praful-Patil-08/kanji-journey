# API Overview

Base: `https://api.kairo.example` or `http://localhost:4000` (`VITE_API_BASE_URL`). All `/api/*` routes require `Authorization: Bearer <Supabase JWT>` except `/health` and `POST /api/pronunciation/score` (optional auth for persistence). Every user-specific resource checks `req.userId === param/body user_id` else `403`.

Consistent error shape: `{ error: string, code?: string, details?: any }`. Never leaks stack. `429` with `X-RateLimit-*` for chat/pron/ocr.

## Auth

`server/middleware/authSupabase.cjs` — verifies via `supabase.auth.getUser(token)` (or dev decode if no `SUPABASE_URL`). Used on all `/api/*`.

## Profiles

- `GET /api/profiles/:userId` — get or auto-create. `403` if not owner.
- `PUT /api/profiles/:userId` — whitelist `display_name,bio,avatar_url,current_level,xp,streak,readiness_score,daily_goal_minutes,exam_date,learning_path,onboarding_completed,last_activity_date`.

## Collections / Lessons

- `GET /api/collections?userId=` — collections with `progressPercentage` (from `LessonProgress`).
- `GET /api/collections/:id` — single collection meta.
- `GET /api/lessons?collectionId=&userId=` — lessons with `status: COMPLETED|CURRENT` (from `LessonProgress`).
- `GET /api/lessons/catalog?level=` — raw catalog for level.
- `GET /api/lessons/:lessonId` — single lesson meta.

## Lesson Progress

- `GET /api/lesson-progress/:userId?level=` — all rows.
- `POST /api/lesson-progress` — upsert `{ user_id, lesson_id, level, week_number, completed, completed_at, quiz_score, time_spent_sec }`. `403` on mismatch.

## Flashcards (SRS)

- `POST /api/flashcards` — upsert by `user_id+front` (prevents duplicates). `201`.
- `GET /api/flashcards/:userId?limit=&cursor=` — cursor pagination (`created_at < cursor`), `{data, nextCursor, hasMore}` if paginated else array. Index `user_id+created_at`.
- `GET /api/flashcards/:userId/due?limit=&cursor=` — `next_review_date ≤ today`, same pagination, `user_id+next_review_date` index.
- `POST /api/flashcards/:cardId/review` — `{grade 0-5}` → SM-2, updates `ease_factor, interval_days, review_state, next_review_date, reviews_total/correct`, persists `FlashcardReview`, feeds `PracticeAttempt` (listening/kanji) for mastery.
- `GET /api/flashcards/:cardId/history` — last 50 reviews, owner only.

## Weak Topics (legacy, also used for quick display)

- `GET /api/weak-topics/:userId` — top 20 by `mistakes_count` desc.
- `POST /api/weak-topics/batch` — `{ items: [{ user_id, topic, skill_area, mistakes_count, last_seen_at }] }` → `bulkWrite` upsert, checks all `user_id === req.userId`.

## Complete Lesson

- `POST /api/complete-lesson` — `{ userId, lessonId, answers: [{question, correct_answer, is_correct}], score, timeSpentSec, level }` → updates `Profile` (xp + streak), bulk upsert `Flashcard` for wrong answers, upsert `LessonProgress`.

## Quiz History

- `GET /api/quiz-history/:userId?limit=20&cursor=ISO` — `LessonProgress` where `completed:true`, sorted `completed_at desc`, cursor pagination if `cursor` present (`{data, nextCursor, hasMore}` else array). Enriched with `lesson_catalog.title`.

## Practice Attempts (Phase 2)

- `POST /api/practice-attempts` — single, `POST /api/practice-attempts/batch` — up to 50. Body `user_id, questionId, topic, section, selectedAnswer, correctAnswer, isCorrect, responseTimeMs, difficulty, level`. Zod validation, 403 on mismatch.
- `GET /api/practice-attempts/:userId?topic=&questionId=&limit=&cursor=ISO` — cursor pagination (`createdAt < cursor`), `{data, nextCursor, hasMore}`.

## Mastery (Phase 3)

- `GET /api/mastery/:userId?topic=&section=&limit=200` — `calculateMastery` over up to 500 recent attempts. Returns `{ byTopic, bySection, overall: {totalAttempts, correctAttempts, accuracy, recentAccuracy, mastery, avgResponseTimeMs, weakCount}, weakTopics: [{topic, mastery, accuracy, recentAccuracy, totalAttempts, lastSeen, reason}], lastSeen }`. No LLM.

## Recommendations (Phase 4)

- `GET /api/recommendations/:userId` — fetches `Profile` + 500 attempts + due count, `calculateMastery` → `generateRecommendations` (due first, then weak, recent mistakes, decay, JLPT level, daily_goal). Returns `{ session: { estimatedMinutes, items: [{type: flashcard|quiz, topic, section, reason, reasonDetail, estimatedMinutes, priority}] } }`.

## Pronunciation (Phase 10)

- `POST /api/pronunciation/score` — `{ audioBase64, targetText }` → HuggingFace `kotoba-whisper-v2.0` ASR → `transcript, pronunciationScore (similarity), pitchAccentScore, suggestions`; if `Authorization` present, persists `PronunciationAttempt` (attemptNumber) and feeds `PracticeAttempt` (listening). `503` if no `HF_API_TOKEN`, `429` if rate limited.
- `GET /api/pronunciation/:userId?targetText=&limit=&cursor=` — history, cursor pagination (`createdAt`).
- `GET /api/pronunciation/:userId/stats?targetText=` — `{ count, avgScore, best, worst, improvement, history }`.

## OCR / Dictionary (Phase 11/12)

- `POST /api/ocr` (auth, rate limited) — `{ imageBase64?, mockText? }` → `recognize` (mock or HF TrOCR) → `detectKanji` (regex) → `lookupKanji` for ≤5 → `{ text, provider, detection: {kanjiChars, compounds, hasKanji}, kanji: [{character, reading, meaning, jlpt, source}] }`. `503` if no provider.
- `GET /api/dictionary/search?q=&limit=` (auth) — Jisho API with 1h cache + static fallback, `limit` 1-20.
- `GET /api/kanji/:character` (auth) — single Kanji lookup, validates `[\u4E00-\u9FAF]`.

## Chat (Phase 7 Scoped RAG)

- `POST /api/chat/enhanced` (auth, rate limited 20/min) — `{ message, history: [{role, content}] (≤8), currentPage, currentLessonId, currentTopic }` → static route check → scoped retrieval (≤3 lessons, weak ≤3, mistakes ≤3, due count, 800-token context) → `generateChatReply` (Gemini 2.0 Flash, 700 tokens, fallback OpenRouter/Groq/Claude/mock) → persist `chat_history`. Returns `{ reply, contextUsed, retrieval: {lessonCount, weakCount, dueCount, tokens, truncated} }`.
- `GET /api/chat/history?limit=50` (auth) — own history.
- `DELETE /api/chat/history` (auth) — clear own history.

## Health & Misc

- `GET /health` — `{ ok: true }`.
- `POST /api/pronunciation/score` is the only endpoint that optionally persists without requiring auth (to allow scoring); history routes require auth.
- All `POST` with `user_id` in body enforce `user_id === req.userId`.

## Pagination

Prefer cursor (`?limit=20&cursor=ISO`) over offset. `limit` 1-100, `cursor` is ISO date of the last item's `created_at`/`completed_at`. Responses are `{ data, nextCursor, hasMore }` when paginated, array otherwise for backward compat.

## Indexes

See `docs/data-model.md` — every `?cursor` uses a `user_id + field` index, no collection scans.

