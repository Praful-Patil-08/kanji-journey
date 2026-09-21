export type PracticeAttemptPayload = {
  user_id: string;
  questionId: string;
  topic: string;
  section?: string | null;
  selectedAnswer: string;
  correctAnswer: string;
  isCorrect: boolean;
  responseTimeMs?: number | null;
  difficulty?: 'easy' | 'medium' | 'hard' | null;
  level?: string;
};

export type PracticeAttempt = {
  id: string;
  user_id: string;
  questionId: string;
  topic: string;
  section: string | null;
  selectedAnswer: string;
  correctAnswer: string;
  isCorrect: boolean;
  responseTimeMs: number | null;
  difficulty: 'easy' | 'medium' | 'hard' | null;
  level: string;
  createdAt: string;
};

export type PracticeAttemptPage = {
  data: PracticeAttempt[];
  nextCursor: string | null;
  hasMore: boolean;
};
