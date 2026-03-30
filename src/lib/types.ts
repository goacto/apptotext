export type AIProvider = "claude" | "openai" | "grok";

export type TextbookLevel = 101 | 201 | 301 | 401 | 501;

export interface TextbookLevelMeta {
  level: TextbookLevel;
  name: string;
  description: string;
  icon: string;
}

export interface Conversion {
  id: string;
  user_id: string;
  source_url: string;
  source_type: "github" | "website";
  source_content: string;
  title: string;
  description: string;
  ai_provider: AIProvider;
  is_public: boolean;
  created_at: string;
  updated_at: string;
}

export interface TextbookChapter {
  id: string;
  conversion_id: string;
  level: TextbookLevel;
  chapter_number: number;
  title: string;
  content: string;
  key_concepts: string[];
  created_at: string;
}

export interface Flashcard {
  id: string;
  conversion_id: string;
  level: TextbookLevel;
  front: string;
  back: string;
  difficulty: number;
  created_at: string;
}

export interface FlashcardProgress {
  id: string;
  user_id: string;
  flashcard_id: string;
  ease_factor: number;
  interval_days: number;
  repetitions: number;
  next_review: string;
  last_reviewed: string;
}

export interface QuizQuestion {
  id: string;
  conversion_id: string;
  level: TextbookLevel;
  question: string;
  options: string[];
  correct_answer: number;
  explanation: string;
  created_at: string;
}

export interface QuizSession {
  id: string;
  user_id: string;
  conversion_id: string;
  level: TextbookLevel;
  score: number;
  total_questions: number;
  xp_earned: number;
  completed_at: string;
}

export interface UserProfile {
  id: string;
  email: string;
  display_name: string;
  avatar_url: string | null;
  total_xp: number;
  current_streak: number;
  longest_streak: number;
  last_activity: string;
  badges: Badge[];
  created_at: string;
}

export interface Badge {
  id: string;
  name: string;
  description: string;
  icon: string;
  earned_at: string;
}

export interface LeaderboardEntry {
  rank: number;
  user_id: string;
  display_name: string;
  avatar_url: string | null;
  total_xp: number;
  conversions_count: number;
  current_streak: number;
}

export interface ConversionRequest {
  url: string;
  ai_provider: AIProvider;
}

export interface GenerateTextbookRequest {
  conversion_id: string;
  level: TextbookLevel;
  source_content: string;
  title: string;
}

export interface GenerateFlashcardsRequest {
  conversion_id: string;
  level: TextbookLevel;
  chapter_content: string;
}

export interface GenerateQuizRequest {
  conversion_id: string;
  level: TextbookLevel;
  chapter_content: string;
  num_questions?: number;
}
