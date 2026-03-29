import { TextbookLevelMeta } from "./types";

export const APP_NAME = "AppToText";
export const APP_DESCRIPTION =
  "Transform any codebase or application into a complete learning textbook";
export const GOACTO_FULL = "Growing Ourselves And Contributing To Others";
export const GOACTO_SHORT = "GOACTO";

export const TEXTBOOK_LEVELS: TextbookLevelMeta[] = [
  {
    level: 101,
    name: "Beginner",
    description:
      "Foundational concepts, basic terminology, and getting started guides",
    icon: "Sprout",
  },
  {
    level: 201,
    name: "Intermediate",
    description:
      "Core patterns, practical usage, and building real features",
    icon: "Leaf",
  },
  {
    level: 301,
    name: "Advanced",
    description:
      "Deep dives into architecture, performance, and best practices",
    icon: "TreePine",
  },
  {
    level: 401,
    name: "Senior",
    description:
      "System design, trade-offs, and leading technical decisions",
    icon: "Mountain",
  },
  {
    level: 501,
    name: "Principal",
    description:
      "Industry-shaping patterns, mentorship perspectives, and vision",
    icon: "Crown",
  },
];

export const XP_REWARDS = {
  CONVERSION_CREATED: 50,
  CHAPTER_READ: 10,
  FLASHCARD_REVIEWED: 5,
  QUIZ_COMPLETED: 25,
  QUIZ_PERFECT_SCORE: 50,
  STREAK_BONUS: 10,
  FIRST_SHARE: 100,
} as const;

export const BADGES = [
  {
    id: "first-conversion",
    name: "First Step",
    description: "Created your first conversion",
    icon: "Rocket",
  },
  {
    id: "level-101",
    name: "Beginner Explorer",
    description: "Completed all 101-level content for a conversion",
    icon: "Sprout",
  },
  {
    id: "level-501",
    name: "Principal Path",
    description: "Reached 501-level content",
    icon: "Crown",
  },
  {
    id: "quiz-master",
    name: "Quiz Master",
    description: "Scored 100% on 5 quizzes",
    icon: "Trophy",
  },
  {
    id: "streak-7",
    name: "Week Warrior",
    description: "Maintained a 7-day learning streak",
    icon: "Flame",
  },
  {
    id: "streak-30",
    name: "Monthly Maven",
    description: "Maintained a 30-day learning streak",
    icon: "Star",
  },
  {
    id: "contributor",
    name: "Contributor",
    description: "Shared a conversion with the community",
    icon: "Heart",
  },
  {
    id: "flashcard-100",
    name: "Card Collector",
    description: "Reviewed 100 flashcards",
    icon: "Layers",
  },
  {
    id: "ten-conversions",
    name: "Knowledge Builder",
    description: "Created 10 conversions",
    icon: "BookOpen",
  },
  {
    id: "goacto-spirit",
    name: "GOACTO Spirit",
    description: "Helped 3 community members by sharing resources",
    icon: "Users",
  },
] as const;

export const AI_PROVIDERS = [
  {
    id: "claude" as const,
    name: "Claude",
    description: "Anthropic's Claude — excellent for educational content",
  },
  {
    id: "openai" as const,
    name: "GPT",
    description: "OpenAI's GPT — strong general capabilities",
  },
  {
    id: "grok" as const,
    name: "Grok",
    description: "xAI's Grok — real-time knowledge",
  },
];
