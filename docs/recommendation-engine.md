# Recommendation Engine

Deterministic, explainable, no LLM. Generates a personalized daily study session.

## Inputs (10 per spec)

1. **SRS due** — `Flashcard.count({ next_review_date ≤ today })`
2. **Weak topics** — `mastery.weakTopics` (mastery<60 or accuracy<65 or recent<55, total≥5)
3. **Recent mistakes** — `recentAttempts` filtered `!isCorrect`
4. **Mistake frequency** — `mistakeFrequency = (total-correct)/total` per topic
5. **Recent accuracy** — last 20 attempts per topic
6. **Time since last practice** — `daysSinceLastSeen`, `decay = max(0.5, 1-(days-7)*0.02)`
7. **Difficulty** — `avgResponseTimeMs` (>3.5s → slow hint) and `difficulty` enum
8. **User JLPT level** — `profile.current_level` (N5..N1) for fallback topic
9. **Topic mastery** — `mastery.byTopic[topic].mastery`
10. **Session duration** — `profile.daily_goal_minutes` (5-60, default 15)

All from `calculateMastery` (Phase 3) and `Profile`.

## Algorithm (`server/services/recommendation.cjs`)

```
dailyGoal = clamp(daily_goal_minutes, 5, 60)
remaining = dailyGoal
items = []

1. SRS due (priority 1): if dueCount>0 → {type:flashcard, reason:due, est: ceil(due/3)*2 (3-8m), reasonDetail: "7 cards due..."}
   remaining -= est

2. Weak topics (priority 2): for each weakTopic sorted asc mastery
      if remaining≤0 or items≥5 break; skip duplicates
      → {type:quiz, topic, reason:weak_topic, est:4m, reasonDetail:"mastery 45% (accuracy 50% over 10 attempts) [+ slow hint if avg>3.5s]"}

3. Recent mistakes (priority 3): for each byTopic where total≥3 && recent<60 and not already in items
      → {type:quiz, reason:recent_mistakes, est:4m, "Recent accuracy on X dropped to 45% over last 10"}

4. Decay (priority 4): for each byTopic where total≥5 && decay<0.85
      → {type:quiz, reason:decay, est:3m, "You haven't practiced X in 12 days..."}

5. Level fallback (priority 5): if items empty or remaining>3 and <3 items
      fallbackTopic = {N5:particles, N4:grammar, N3:reading, N2:reading, N1:listening}[level]
      → {type:quiz, reason: onboarding|balanced_review, est: remaining, "Start with N5 particles..."}

Cap to 5 items, estimatedMinutes = sum(est)
If still empty → starter {topic: hiragana|vocabulary, 10m}
```

Every item has `reason` (enum) and `reasonDetail` (human, e.g., "Recommended because accuracy on particles dropped to 58% over the last 20 attempts.").

## Example Response

`GET /api/recommendations/:userId` →

```json
{
  "session": {
    "estimatedMinutes": 12,
    "items": [
      { "type": "flashcard", "reason": "due", "reasonDetail": "7 cards due...", "estimatedMinutes": 4, "priority": 1, "dueCount": 7 },
      { "type": "quiz", "topic": "particles", "reason": "weak_topic", "reasonDetail": "Recommended because mastery on particles is 45% (accuracy 50% over 10 attempts).", "estimatedMinutes": 4, "priority": 2 },
      { "type": "quiz", "topic": "kanji", "reason": "recent_mistakes", "reasonDetail": "Recent accuracy on kanji dropped to 45% over last 10 attempts — quick drill recommended.", "estimatedMinutes": 4, "priority": 3 }
    ]
  }
}
```

## Determinism & Testing

- Pure function `generateRecommendations({dueCount, mastery, profile, now})` — same inputs → same output.
- `src/test/recommendation.test.ts` (9 tests): due first, starter, weak explainable, recent (30 attempts, last 20 low), daily_goal cap, JLPT level, reasonDetail, determinism, no duplicates.
- `src/test/mastery.test.ts` feeds it.

## Integration

- `GET /api/recommendations/:userId` does `calculateMastery` over 500 attempts + `Profile` + `dueCount` → `generateRecommendations`.
- Frontend `useRecommendations` (TanStack Query, 60s stale, offline cached) drives `Dashboard` "Recommended Next" and `Progress` "Recommended Next" cards.

## Decisions

| Problem | Decision | Alternative | Reason |
|---------|----------|-------------|--------|
| Engine | Rule-based, explainable | LLM | No hallucination, deterministic, `reasonDetail` for interview |
| SRS first | Yes | Weak first | Retention is foundation; due cards are time-sensitive |
| Cap | 5 items, dailyGoal 5-60 | Unlimited | Fits a study session, respects time |
| No duplicate | Skip topic already in items | Allow duplicates | Diversify practice |

