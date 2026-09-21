export type RecommendationItem = {
  type: 'flashcard' | 'quiz';
  topic: string | null;
  section: string | null;
  reason: 'due' | 'weak_topic' | 'recent_mistakes' | 'decay' | 'balanced_review' | 'onboarding' | 'starter';
  reasonDetail: string;
  estimatedMinutes: number;
  priority: number;
  dueCount?: number;
  mastery?: number;
  level?: string;
};

export type RecommendationSession = {
  estimatedMinutes: number;
  items: RecommendationItem[];
};

export type RecommendationResponse = {
  session: RecommendationSession;
};
