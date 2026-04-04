import { TextbookLevel } from "../types";
import { GOACTO_FULL } from "../constants";

const LEVEL_DESCRIPTIONS: Record<TextbookLevel, string> = {
  101: `BEGINNER (101): Write for someone completely new to this topic. Use simple language, analogies, and step-by-step explanations. Define every technical term when first used. Include "Try it yourself" exercises.`,
  201: `INTERMEDIATE (201): Write for someone with basic understanding. Introduce patterns, best practices, and practical real-world usage. Include code examples and mini-projects.`,
  301: `ADVANCED (301): Write for experienced developers. Cover architecture decisions, performance optimization, edge cases, and debugging strategies. Include complex examples.`,
  401: `SENIOR (401): Write for senior engineers. Focus on system design, scalability, trade-offs, team leadership of technical decisions, and production-ready patterns. Include case studies.`,
  501: `PRINCIPAL (501): Write for principal/staff engineers. Cover industry-wide patterns, cross-system architecture, mentoring perspectives, tech strategy, and vision. Include thought leadership content.`,
};

export function getTextbookSystemPrompt(level: TextbookLevel): string {
  return `You are an expert technical educator creating a comprehensive textbook chapter. Your content embodies the values of ${GOACTO_FULL} — helping people grow their skills while building a culture of sharing knowledge.

${LEVEL_DESCRIPTIONS[level]}

IMPORTANT GUIDELINES:
- Structure content with clear headings (## for sections, ### for subsections)
- Include practical code examples relevant to the source material
- Add "Key Takeaway" boxes for important concepts
- End each chapter with a "Growth Challenge" that encourages both personal learning AND sharing knowledge with others (the GOACTO spirit)
- Use encouraging, growth-minded language throughout
- Make content progressively build on previous concepts

Output format: Markdown with clear structure.`;
}

export function getTextbookUserPrompt(
  title: string,
  sourceContent: string,
  level: TextbookLevel,
  chapterNumber: number
): string {
  const chapterFocus = chapterNumber === 1
    ? "Focus on introducing the core concepts, setup, and foundational ideas."
    : chapterNumber === 2
      ? "Focus on practical application, patterns, and hands-on examples. Build on the foundational concepts from Chapter 1."
      : "Focus on advanced techniques, real-world scenarios, and deeper insights. Build on everything covered in earlier chapters.";

  return `Create Chapter ${chapterNumber} of 3 in a ${level}-level textbook about "${title}".

${chapterFocus}

Source material to base the chapter on:
---
${sourceContent.slice(0, 12000)}
---

Generate a comprehensive chapter that teaches this material at the ${level} level. Include:
1. Chapter title (include "Chapter ${chapterNumber}:" prefix)
2. Learning objectives (3-5 bullet points)
3. Main content with code examples
4. Key concepts list (as a JSON array of strings at the very end, wrapped in \`\`\`json blocks labeled KEY_CONCEPTS)
5. A "Growth Challenge" section encouraging both self-improvement and helping others learn

Make the content thorough, educational, and aligned with the GOACTO values of growing together.`;
}

export function getFlashcardSystemPrompt(): string {
  return `You are creating educational flashcards from technical content. Each flashcard should test a single concept clearly.

Output format: Return a JSON array of flashcard objects, each with:
- "front": The question or prompt (clear, specific)
- "back": The answer (concise but complete)
- "difficulty": 1-5 (1=basic recall, 5=deep understanding)

Return ONLY the JSON array, no other text.`;
}

export function getFlashcardUserPrompt(
  content: string,
  level: TextbookLevel
): string {
  return `Create 10-15 flashcards from this ${level}-level content:

${content.slice(0, 8000)}

Adjust complexity to match the ${level} level:
- 101: Basic definitions and concepts
- 201: How things work and when to use them
- 301: Why things work, edge cases, optimization
- 401: Design decisions, trade-offs, system thinking
- 501: Industry patterns, leadership, architectural vision

Return ONLY a JSON array of flashcard objects.`;
}

export function getQuizSystemPrompt(): string {
  return `You are creating a multiple-choice quiz from technical content. Questions should test understanding, not just memorization.

Output format: Return a JSON array of question objects, each with:
- "question": The question text
- "options": Array of 4 possible answers
- "correct_answer": Index (0-3) of the correct option
- "explanation": Brief explanation of why the correct answer is right

Return ONLY the JSON array, no other text.`;
}

export function getQuizUserPrompt(
  content: string,
  level: TextbookLevel,
  numQuestions: number
): string {
  return `Create ${numQuestions} multiple-choice questions from this ${level}-level content:

${content.slice(0, 8000)}

Question difficulty should match the ${level} level:
- 101: Basic recall and understanding
- 201: Application and practical usage
- 301: Analysis and problem-solving
- 401: Evaluation and design decisions
- 501: Synthesis and strategic thinking

Include a mix of difficulties within the level. Return ONLY a JSON array.`;
}
