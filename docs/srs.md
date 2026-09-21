# SRS (Spaced Repetition)

Kairo preserves the **SM-2** implementation (`server/services/srs.cjs`) and hardens it for production.

## Algorithm (SM-2)

Grade `0–5` (0–2 = forgot, 3–5 = recalled).

```
reviews_total +=1; if grade≥3 reviews_correct+=1
if grade<3:
  interval_days = 1
  ease_factor = max(1.3, ease-0.2)
  review_state = 'learning'
else:
  if interval_days ≤1: interval = 6
  else: interval = round(interval * ease)
  ease = max(1.3, ease + 0.1 - (5-grade)*(0.08 + (5-grade)*0.02))
  review_state = interval ≥21 ? 'review' : 'learning'
next_review_date = today + interval_days (YYYY-MM-DD)
```

Initial: `ease 2.5, interval 1, state new`.

## Example

- New card, grade 5 → interval 6, ease 2.6, correct+1
- Interval 6, grade 5 → interval 15 (6×2.5), ease 2.6
- Interval 21, grade 5 → interval 53, state `review`
- Any grade <3 → interval 1, ease -0.2, state `learning`, not correct

## Storage

`flashcards` collection:

```
{ id, user_id, lesson_id, front, back, review_state, ease_factor, interval_days, next_review_date, reviews_total, reviews_correct, created_at, updated_at }
```

- `user_id+front` unique → `findOneAndUpdate({user_id, front}, {$setOnInsert}, {upsert:true})` prevents duplicates.
- `user_id+next_review_date` index for `GET /:userId/due` (`next_review_date ≤ today`).
- `user_id+created_at` for cursor pagination.

`flashcard_reviews` collection (Phase 6) persists every review:

```
{ id, user_id, card_id, grade, ease_before/after, interval_before/after, review_state_before/after, createdAt }
```

Indexes: `user_id+createdAt`, `card_id+createdAt`, `user_id+card_id+createdAt`. `GET /:cardId/history` returns last 50.

## API

- `POST /api/flashcards` — upsert by `front`.
- `POST /api/flashcards/:cardId/review` — `grade 0-5`, `sm2Review`, update card, create `FlashcardReview`, create `PracticeAttempt` (`flashcard:${cardId}`, topic from `lesson_id` skill_area, `isCorrect=grade≥3`) so reviews feed mastery/recommendations.
- `GET /:userId` / `GET /:userId/due` — cursor pagination.
- `GET /:cardId/history` — review history.

## Tests

`src/test/srsReview.test.ts` (12 tests) verifies:
- grade 0,1,2 → interval 1, ease 2.3, learning, not correct
- grade 3 → interval 6, ease 2.36, learning (6<21)
- grade 4 → interval 6, ease 2.5
- grade 5 → interval 6, ease 2.6; 6→15; 21→53 review
- ease floor 1.3, counters, next_review_date, branching

`src/test/scheduler.test.ts` also verifies the same logic in TypeScript (for SQL mirror).

## Integration

- `complete-lesson` bulk-inserts flashcards for wrong answers.
- `useFlashcards`, `useFlashcardsDue`, `useFlashcardsInfinite`, `useReviewFlashcard` (TanStack Query, `cacheSet` for offline).
- Due count feeds `buildLearnerContext` (RAG) and `generateRecommendations` (priority 1).

## Decisions

| Problem | Decision | Alternative | Reason |
|---------|----------|-------------|--------|
| Algorithm | SM-2 | FSRS, Leitner | Simple, deterministic, 6 grades, interview explainable |
| History | Separate `flashcard_reviews` collection | Only counters | Allows per-card improvement graph, analytics |
| Duplicate | `user_id+front` unique + upsert | Allow duplicates | Prevents "東京" twice for same user |
| Feed mastery | Create `PracticeAttempt` on review | Separate analytics | Reuses existing mastery engine, no new aggregation |

