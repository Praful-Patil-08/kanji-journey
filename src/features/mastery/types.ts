export type TopicMastery = {
  totalAttempts: number;
  correctAttempts: number;
  accuracy: number;
  recentAccuracy: number;
  mistakeFrequency: number;
  avgResponseTimeMs: number | null;
  lastSeen: string | null;
  daysSinceLastSeen: number | null;
  decay: number;
  mastery: number; // 0-100
  isWeak: boolean;
};

export type WeakTopicInsight = {
  topic: string;
  mastery: number;
  accuracy: number;
  recentAccuracy: number;
  totalAttempts: number;
  lastSeen: string | null;
  reason: string;
};

export type MasteryResponse = {
  byTopic: Record<string, TopicMastery>;
  bySection: Record<string, TopicMastery>;
  overall: {
    totalAttempts: number;
    correctAttempts: number;
    accuracy: number;
    recentAccuracy: number;
    mastery: number;
    avgResponseTimeMs: number | null;
    weakCount: number;
  };
  weakTopics: WeakTopicInsight[];
  lastSeen: string | null;
};
