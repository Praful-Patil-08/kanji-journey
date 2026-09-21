# Scholar AI — Scoped RAG

This document describes the contextual learning assistant (Scholar AI) retrieval and generation design for Kairo. It is **not** a generic chatbot; it is a JLPT-level-aware tutor that only retrieves relevant learning material and learner-specific data.

## Problem

A naive tutor that sends the entire database or the user's full history to the LLM is:
- **Expensive** (tokens),
- **Slow**,
- **Insecure** (exposes other users' data if not checked),
- **Unhelpful** (irrelevant context confuses the model).

We need a **scoped** retrieval that gives the model exactly what it needs for the current question.

## Architecture

```
React (AIChatBubble)
  ↓  POST /api/chat/enhanced { message, history, currentPage, currentLessonId, currentTopic } + Bearer token
Express (authSupabase)
  ↓  verify JWT → req.userId
  ↓  fetch: Profile (level, streak, XP), PracticeAttempt (last 20), Flashcard due count, Mastery (calculateMastery)
  ↓  RAG service
      ├─ retrieveRelevantLessons(message, currentLessonId, currentTopic, level) → up to 3 lessons
      ├─ buildLearnerContext(mastery, recentAttempts, dueCount) → weak topics (≤3), recent mistakes (≤3), SRS state
      └─ buildScopedContext(profile, lessons, learnerContext, page, topic) → 800-token context
  ↓  Prompt construction: systemInstruction + scopedContext + history (≤8) + message
  ↓  Gemini 2.0 Flash (700 tokens, temp 0.4) → fallback gemini-1.5-flash → fallback mock
  ↓  persist chat_history (user + assistant) + return { reply, retrieval }
```

For the Supabase Edge Function (`supabase/functions/chat/index.ts`) the flow is identical, but it reads `profiles` from Supabase instead of MongoDB. The Express route is the primary for the portfolio because it can join MongoDB (PracticeAttempt, Flashcard, Profile) with the static lesson catalog.

## Retrieval

### Lesson retrieval (`server/services/rag.cjs:retrieveRelevantLessons`)

- Deterministic keyword scoring, no embeddings (keeps the portfolio explainable and offline-testable).
- Score = 100 for exact `currentLessonId` match, +30 for `currentTopic` overlap, +10 for same JLPT level, +5 per keyword hit in `title/topics/skill_area`.
- Special boost: Japanese particles (`は, が, を...`) → `+15` for `particles` lessons; `は vs が` → `+20` for `n5-w3-l2` (Core Particles).
- Returns top 3; if no hit, falls back to `currentLessonId` or first lesson of user's level.

### Learner retrieval (`buildLearnerContext`)

- Weak topics: `mastery.weakTopics.slice(0,3)` with `mastery, accuracy, totalAttempts, reason`.
- Recent mistakes: last 5 incorrect `PracticeAttempt` with `selected/correct` and `questionId`.
- SRS: `dueCount` from `Flashcard` (next_review_date ≤ today).
- All capped to 3 each to keep context small.

### Why RAG

- **Relevance**: When the user asks `は vs が` we retrieve `Core Particles は を に で` plus their own mistakes on particles, not the entire N5 curriculum.
- **Cost**: 800-token scoped context vs. sending 21 lessons + 500 attempts.
- **Personalization**: Weak topics and recent mistakes make the tutor say "You missed particles 58% over last 20" instead of generic grammar.

## Context Construction

`buildScopedContext` concatenates:

```
Learner: Student | Level: N5 | Streak: 3d | XP: 120 | Daily goal: 15min
Current page: /library/p1
Current lesson: n5-w3-l2
Current topic: particles
Relevant lesson material:
- Core Particles は を に で [N5 Week 3] — grammar, topics: particles, sentence structure
  Characters: は を に で
Weak topics (2):
- particles: mastery 45%, accuracy 50% (10 attempts, recent accuracy 45% over last 10)
...
SRS: 7 cards due
```

Then truncated to **800 tokens** (~3200 chars) via `truncateToTokens`. Tokens estimated as `chars/4`. History is limited to 8 messages, each truncated to 800 chars. Generation is limited to `maxOutputTokens: 700`.

## Security

- **Authentication gate**: `authSupabase` verifies the Bearer token via `supabase.auth.getUser(token)` (or dev fallback decode). `req.userId` is the source of truth.
- **Ownership check**: Every DB query filters by `user_id = req.userId`. The `userId` in the body, if present, must match `req.userId` or the request is `403`. Never trust client-sent `userId` alone.
- **No bulk fetch**: `PracticeAttempt.find({ user_id: userId }).limit(20)` — never `find({})`.
- **No secret leak**: `GEMINI_API_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `MONGODB_URI` are server-only (`process.env`), never sent to the client. The `api` client only sends the Supabase JWT.

## Token Management

- **Input guard**: `message.slice(0, 400)` in `gemini.cjs:270` and `message.length ≤ 2000` in route.
- **History guard**: `history.slice(-8)` and each `content.slice(0,800)`.
- **Context guard**: `maxTokens: 800` for scoped context, `maxOutputTokens: 700` for generation (`temperature 0.4`).
- **Cache**: `SimpleCache` (1h, 200 entries) in `gemini.cjs` for identical prompts to save tokens.

## Fallback Behavior

1. **Static routes** (`getStaticRoute`): JLPT dates, book recommendations, SRS FAQ → instant, no LLM.
2. **Primary LLM**: `gemini-2.0-flash` with 25s timeout.
3. **Fallback LLMs**: OpenRouter → Groq → Claude via `tryFallbackProviders`.
4. **Mock**: curated study tip if all LLMs fail. The API still returns `200` with `reply` so the UI doesn't break.
5. **No context**: If `mastery` is empty (new user), `buildLearnerContext` returns "no weak topics" and the tutor gives a level-appropriate starter lesson.

## Limitations

- Retrieval is keyword-based, not vector search; it won't handle paraphrased Japanese well. A future `pgvector` or `Mongo Atlas Vector` could replace `retrieveRelevantLessons` without changing the interface.
- No streaming in the Express route (Edge Function has `callGeminiStream` but the UI uses non-streaming for simplicity). Streaming can be added with the same scoped context.
- Lesson content is from the static catalog (`server/data/lessonCatalog.cjs`), not a full textbook. Real RAG would index lesson markdown.

## Interview Talking Points

- "How does your RAG work?" → retrieval scoring, scoped context, token limits, why not send whole DB.
- "How do you protect user data?" → JWT verification, `req.userId` as source of truth, per-query `user_id` filter, 403 on mismatch.
- "How do you handle tokens?" → input/history/context/output caps, cache, truncation.
- "Why not use LLM for mastery?" → mastery is deterministic arithmetic (`server/services/mastery.cjs`), only the tutor is LLM.

## Files

- `server/services/rag.cjs:1` — retrieval + context builder, pure and testable
- `server/services/mastery.cjs:1` — deterministic mastery, feeds RAG
- `server/routes/chat.cjs:1` — scoped RAG endpoint with auth and retrieval
- `server/lib/gemini.cjs:1` — Gemini + fallbacks + cache + static routes
- `supabase/functions/chat/index.ts:1` — Edge Function equivalent (Supabase profiles)
- `src/components/AIChatBubble.tsx:76` — sends `currentPage, currentLessonId, currentTopic, history` via `api` (auth)
- `src/features/mastery` + `src/hooks/data/useMastery` — learner data source
