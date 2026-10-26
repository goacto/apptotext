/** Server-side caps for client text sent into AI routes. */

export const CHAT_MAX_MESSAGES = 10;
export const CHAT_MAX_MESSAGE_CHARS = 8_000;
export const CHAT_MAX_TOTAL_CHARS = 40_000;

/** UUIDs are 36 characters. This bounds id strings that are not free-text prompts. */
export const AI_ID_MAX_CHARS = 64;

/** Generated quizzes ask for 10 questions. Headroom stays well under an unbounded array. */
export const QUIZ_MAX_ANSWERS = 50;

export interface ChatTurn {
  role: "user" | "assistant";
  content: string;
}

export type ChatInputResult =
  | { ok: true; message: string; history: ChatTurn[] }
  | { ok: false; error: string };

/**
 * Caps the new message and client history.
 * System and any other role are dropped. Oversized text is rejected.
 */
export function prepareChatInput(message: unknown, history: unknown): ChatInputResult {
  if (typeof message !== "string") {
    return { ok: false, error: "Message is required" };
  }
  if (message.length > CHAT_MAX_MESSAGE_CHARS) {
    return { ok: false, error: "Message is too long" };
  }
  const trimmed = message.trim();
  if (!trimmed) return { ok: false, error: "Message is required" };

  const rawHistory = history == null ? [] : history;
  if (!Array.isArray(rawHistory)) {
    return { ok: false, error: "history must be an array" };
  }
  if (rawHistory.length > CHAT_MAX_MESSAGES) {
    return { ok: false, error: "Too many history messages" };
  }

  const kept: ChatTurn[] = [];
  let total = trimmed.length;
  for (const item of rawHistory) {
    if (!item || typeof item !== "object") {
      return { ok: false, error: "Invalid history message" };
    }
    const role = (item as { role?: unknown }).role;
    const content = (item as { content?: unknown }).content;
    if (typeof content !== "string") {
      return { ok: false, error: "Invalid history message" };
    }
    if (content.length > CHAT_MAX_MESSAGE_CHARS) {
      return { ok: false, error: "A history message is too long" };
    }
    if (role !== "user" && role !== "assistant") {
      continue;
    }
    total += content.length;
    if (total > CHAT_MAX_TOTAL_CHARS) {
      return { ok: false, error: "Conversation is too long" };
    }
    kept.push({ role, content });
  }

  return { ok: true, message: trimmed, history: kept };
}

/** Error string when a client id is missing or longer than AI_ID_MAX_CHARS, otherwise null. */
export function clientIdError(value: unknown, field: string): string | null {
  if (typeof value !== "string" || value.length === 0) return `${field} is required`;
  if (value.length > AI_ID_MAX_CHARS) return `${field} is too long`;
  return null;
}

export interface QuizAnswerInput {
  question_id: string;
  selected: number;
}

export function parseQuizAnswers(
  answers: unknown
): { ok: true; answers: QuizAnswerInput[] } | { ok: false; error: string } {
  if (!Array.isArray(answers) || answers.length === 0) {
    return { ok: false, error: "answers array is required and must not be empty" };
  }
  if (answers.length > QUIZ_MAX_ANSWERS) {
    return { ok: false, error: "Too many answers" };
  }

  const parsed: QuizAnswerInput[] = [];
  for (const answer of answers) {
    if (!answer || typeof answer !== "object") {
      return { ok: false, error: "Each answer must have question_id (string) and selected (number)" };
    }
    const questionId = (answer as { question_id?: unknown }).question_id;
    const selected = (answer as { selected?: unknown }).selected;
    const idError = clientIdError(questionId, "question_id");
    if (idError === "question_id is required" || typeof selected !== "number") {
      return { ok: false, error: "Each answer must have question_id (string) and selected (number)" };
    }
    if (idError) return { ok: false, error: idError };
    parsed.push({ question_id: questionId as string, selected });
  }
  return { ok: true, answers: parsed };
}
