/**
 * queryKeys — stable, typed query key factory for all React Query hooks.
 * All cache keys and invalidations must reference this factory — never use ad-hoc arrays.
 */
export const queryKeys = {
  // ── Auth / User ──────────────────────────────────────────────────
  profile:    (userId: string) => ['profile', userId] as const,

  // ── Curriculum ───────────────────────────────────────────────────
  collections:      (userId: string)                        => ['collections', userId] as const,
  lessons:          (collectionId: string, userId: string)  => ['lessons', collectionId, userId] as const,
  collectionDetail: (collectionId: string)                  => ['collection-detail', collectionId] as const,
  lessonCatalog:    (level: string)                         => ['lessonCatalog', level] as const,
  lessonProgress:   (userId: string, level: string)         => ['lessonProgress', userId, level] as const,
  nextLesson:       (userId: string, level: string)         => ['nextLesson', userId, level] as const,

  // ── Practice / Exam ──────────────────────────────────────────────
  practiceQuestions: (level: string, topic: string, count: number) =>
    ['practice-questions', level, topic, count] as const,
  examQuestions:  (level: string, section: string) => ['examQuestions', level, section] as const,
  generatedExam:  (level: string)                  => ['generatedExam', level] as const,

  // ── Sessions (local-JSON content) ────────────────────────────────
  readingPassages:  (collectionId?: string | null) => ['reading-passages', collectionId ?? null] as const,
  grammarExercises: (collectionId?: string | null) => ['grammar-exercises', collectionId ?? null] as const,
  vocabQuiz:        (collectionId?: string | null) => ['vocab-quiz', collectionId ?? null] as const,
  words:            (level: string, limit: number, offset: number) =>
    ['words', level, limit, offset] as const,
  wordLookup: (word: string) => ['word-lookup', word] as const,

  // ── SRS Flashcards ───────────────────────────────────────────────
  flashcardsDue: (userId: string, collectionId?: string | null) =>
    ['flashcardsDue', userId, collectionId ?? 'all'] as const,
  flashcards: (userId: string) => ['flashcards', userId] as const,
  flashcardsInfinite: (userId: string) => ['flashcardsInfinite', userId] as const,
  flashcardsDueInfinite: (userId: string) => ['flashcardsDueInfinite', userId] as const,

  // ── Progress & Analytics ─────────────────────────────────────────
  quizHistory:  (userId: string) => ['quizHistory', userId] as const,
  quizHistoryInfinite: (userId: string) => ['quizHistoryInfinite', userId] as const,
  weakTopics:   (userId: string) => ['weakTopics', userId] as const,

  // ── Practice Attempts ──────────────────────────────────────────────
  practiceAttempts: (userId: string, topic?: string | null, questionId?: string | null) =>
    ['practiceAttempts', userId, topic ?? 'all', questionId ?? 'all'] as const,
  practiceHistory:  (userId: string) => ['practiceHistory', userId] as const,

  // ── Mastery ──────────────────────────────────────────────────────────
  mastery: (userId: string, topic?: string | null, section?: string | null) =>
    ['mastery', userId, topic ?? 'all', section ?? 'all'] as const,

  // ── Recommendations ──────────────────────────────────────────────────
  recommendations: (userId: string) => ['recommendations', userId] as const,

  // ── Onboarding / Level ───────────────────────────────────────────
  learningPath:  (userId: string) => ['learningPath', userId] as const,
  levelOverride: (userId: string) => ['levelOverride', userId] as const,
} as const;
