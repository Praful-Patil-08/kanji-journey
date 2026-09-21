# Data Model

All user data is owned by `user_id` (Supabase `auth.users.id`, string). Every query filters by `user_id`. Duplicates are prevented by `user_id + front` or `user_id + lesson_id` unique indexes where appropriate.

## Collections (MongoDB via Mongoose)

### profiles
Matches Supabase `profiles` shape for frontend types.
```
{ id, user_id (unique, index), display_name, bio, avatar_url, current_level (N5..N1), xp, streak, readiness_score, daily_goal_minutes, exam_date, learning_path, onboarding_completed, last_activity_date, created_at, updated_at }
```
Indexes: `user_id` unique. Auto-created on `GET /api/profiles/:userId` if missing.

### lesson_progress
```
{ id, user_id (index), lesson_id, level, week_number, completed, completed_at (ISO string), quiz_score, time_spent_sec, created_at }
```
Indexes: `user_id+lesson_id` unique, `user_id+completed+completed_at`, `user_id+completed_at` (for `GET /api/quiz-history/:userId?cursor=completed_at`).

### flashcards
```
{ id, user_id (index), lesson_id (nullable, catalog id or null), front, back, review_state (new|learning|review), ease_factor (2.5), interval_days (1), next_review_date (YYYY-MM-DD), reviews_total, reviews_correct, created_at, updated_at }
```
Indexes: `user_id+front` unique (prevents duplicates, upsert), `user_id+next_review_date` (due query), `user_id+created_at` (cursor pagination), `user_id+updated_at`.

### flashcard_reviews
History of every SM-2 review (Phase 6).
```
{ id, user_id (index), card_id (index), grade (0-5), ease_before, ease_after, interval_before, interval_after, review_state_before, review_state_after, createdAt (Date) }
```
Indexes: `user_id+createdAt`, `card_id+createdAt`, `user_id+card_id+createdAt`. Used for `GET /api/flashcards/:cardId/history`.

### weak_topics
Simple mistake counters (also used for legacy, but mastery engine now uses PracticeAttempt).
```
{ id, user_id (index), topic, skill_area, mistakes_count, last_seen_at }
```
Index: `user_id+topic+skill_area` unique.

### practice_attempts (Phase 2)
Granular per-question answer.
```
{ id, user_id (index), questionId, topic, section (nullable), selectedAnswer, correctAnswer, isCorrect, responseTimeMs (nullable, 0-600000), difficulty (easy|medium|hard|null), level (N5..N1), createdAt (Date) }
```
Indexes: `user_id+createdAt`, `user_id+topic+createdAt`, `questionId+createdAt`, `createdAt`, `user_id+isCorrect+createdAt`. Supports `GET /api/practice-attempts/:userId?topic=&questionId=&limit=&cursor=ISO` (cursor = `createdAt`).

### pronunciation_attempts (Phase 10)
```
{ id, user_id (index), targetText, transcript, pronunciationScore (0-100), pitchAccentScore (0-100), attemptNumber (per targetText), createdAt (Date) }
```
Indexes: `user_id+targetText+createdAt`, `user_id+createdAt`, `targetText+createdAt`. Supports `GET /api/pronunciation/:userId?targetText=&cursor=` and stats.

### chat_history (via `db.collection` not Mongoose, for flexibility)
```
{ _id, user_id (string), message, role (user|assistant), createdAt }
```
No Mongoose model; accessed via `connectDB().collection('chat_history')`. Used by `POST /api/chat/enhanced` to persist conversations.

## Supabase (Postgres) — migrations in `supabase/migrations/`

- `001_full_schema.sql` — `lesson_catalog` (21 rows N5..N1, with `skill_area`, `topics`), `profiles`, `collections`, `learning_paths`, `level_overrides`, `lesson_progress`, `quiz_attempts`, `weak_topics`, `flashcards`, `practice_questions` (seeded N5), etc.
- `002_practice_questions.sql`, `003_exam_seed_expansion.sql`, etc. — expand question bank and compat views.
- `009_collections_and_lessons.sql` — collections.
- The app **reads** `lesson_catalog` via `server/data/lessonCatalog.cjs` (static mirror) to avoid DB round-trip; the static file is the source of truth for the SRS and RAG lesson retrieval. Supabase is the source for auth and for the Edge Function (`supabase/functions/chat`).

## Lesson Catalog (static)

`server/data/lessonCatalog.cjs` — 21 lessons:
```
{ id: 'n5-w3-l2', level: 'N5', week_number: 3, lesson_number: 2, title: 'Core Particles は を に で', skill_area: 'grammar', topics: ['particles','sentence structure'], collection_id: 'p1', characters: ['は','を','に','で'] }
```
Collections: `h1` Hiragana, `k1` Katakana, `p1` Particle Logic, `v1` Verbal Rituals, `f1` Starter, `f2` Intermediate.

## Indexes Summary (query decisions)

- **Flashcards due**: `user_id + next_review_date` — `GET /:userId/due` does `next_review_date ≤ today` without scan.
- **Cursor pagination**: all use `user_id + created_at` or `completed_at` with `sort({ field: -1 }).limit(limit+1)` and `field < cursor`. No `skip`, so O(log n) and stable.
- **Mastery**: `user_id+topic+createdAt` and `user_id+isCorrect+createdAt` let `calculateMastery` fetch 500 recent attempts efficiently; the engine itself is in-memory after fetch.
- **Pronunciation**: `user_id+targetText+createdAt` for per-phrase history and improvement.

## Ownership

Every `find`/`findOne` includes `user_id = req.userId` (from verified JWT). `POST` bodies that contain `user_id` must match `req.userId` or 403. No `userId` from query string is trusted without check.

## TTL / Cache

- Browser: IndexedDB `kairo` stores `lessons, flashcards, practiceQuestions, progress, preferences` with 24h TTL.
- Server: `dictionary.cjs` in-memory `Map` with 1h TTL for Jisho, plus `STATIC_DICT` fallback.
