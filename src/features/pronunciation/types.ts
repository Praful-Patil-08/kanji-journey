export type PronunciationAttempt = {
  id: string;
  user_id: string;
  targetText: string;
  transcript: string;
  pronunciationScore: number;
  pitchAccentScore: number;
  attemptNumber: number;
  createdAt: string;
};

export type PronunciationHistoryPage = {
  data: PronunciationAttempt[];
  nextCursor: string | null;
  hasMore: boolean;
  improvement: number | null;
};

export type PronunciationStats = {
  count: number;
  avgScore: number;
  best: number;
  worst: number;
  improvement: number;
  history: Array<{ attemptNumber: number; score: number; createdAt: string; transcript: string }>;
};

export type PronunciationScoreResponse = {
  transcript: string;
  pronunciationScore: number;
  pitchAccentScore: number;
  suggestions: string[];
  attemptNumber?: number;
  historyId?: string;
  persisted: boolean;
};
