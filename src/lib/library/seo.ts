import { TEXTBOOK_LEVELS } from "@/lib/constants";

export const SITE_URL = "https://apptotext.com";
export const LIBRARY_PAGE_SIZE = 24;
export const LIBRARY_REVALIDATE_S = 3600;

const LEVELS = TEXTBOOK_LEVELS.map((l) => l.level as number);

export function levelName(level: number): string {
  return TEXTBOOK_LEVELS.find((l) => l.level === level)?.name ?? String(level);
}

/** FR-6.1: "101-beginner", "501-principal". */
export function levelSlug(level: number): string {
  return `${level}-${levelName(level).toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
}

/** Accepts "101", "101-beginner", "101-Whatever"; returns the level or null. */
export function parseLevelSlug(slug: string): number | null {
  const m = /^(\d{3})(?:-[a-z0-9-]*)?$/i.exec(slug);
  if (!m) return null;
  const n = Number(m[1]);
  return LEVELS.includes(n) ? n : null;
}

export function repoPath(repoKey: string): string {
  return `/library/${repoKey}`;
}

export function levelPath(repoKey: string, level: number): string {
  return `/library/${repoKey}/${levelSlug(level)}`;
}

export function removalLink(repoKey: string): string {
  return `/library/remove?repo=${encodeURIComponent(repoKey)}`;
}

/**
 * FR-6.2: canonical form is the lowercase repo_key and the full level slug.
 * Returns the path to 308 to, or null when the request is already canonical.
 */
export function canonicalRedirect(owner: string, repo: string, levelSeg: string | null, canonicalKey: string): string | null {
  const reqKey = `${decodeURIComponent(owner)}/${decodeURIComponent(repo)}`;
  if (levelSeg === null) return reqKey === canonicalKey ? null : repoPath(canonicalKey);
  const level = parseLevelSlug(decodeURIComponent(levelSeg));
  if (level === null) return null;
  const want = levelSlug(level);
  return reqKey === canonicalKey && levelSeg === want ? null : levelPath(canonicalKey, level);
}

/** FR-6.4: "{full_name} — {Level name} guide ({level}) | AppToText", <= 60 chars, shorter fallbacks. */
export function levelTitle(fullName: string, level: number): string {
  const name = levelName(level);
  const candidates = [
    `${fullName} — ${name} guide (${level}) | AppToText`,
    `${fullName} — ${name} guide (${level})`,
    `${fullName} ${level} guide`,
  ];
  return candidates.find((c) => c.length <= 60) ?? `${fullName}`.slice(0, 60);
}

/** First ~155 chars of chapter prose (markdown, code and headings stripped). */
export function descriptionFrom(markdown: string, max = 155): string {
  const prose = markdown
    .replace(/```[\s\S]*?```/g, " ")
    .split(/\n+/)
    .filter((l) => l.trim() && !/^\s*(#|>|\||[-*+]\s|\d+\.\s|KEY_CONCEPTS)/.test(l))
    .join(" ")
    .replace(/`([^`]*)`/g, "$1")
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/[*_~]+/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (prose.length <= max) return prose;
  const cut = prose.slice(0, max - 1);
  return `${cut.slice(0, Math.max(cut.lastIndexOf(" "), max - 20)).trimEnd()}…`;
}

export function wordCount(text: string): number {
  return (text.match(/\S+/g) ?? []).length;
}

const REFUSAL = /\b(as an ai language model|i (?:can(?:'|no)t|am unable to|won't) (?:help|assist|provide|create|write))/i;

/** FR-6.6 thin-content rule. Returns the reasons a page must be noindex (empty = indexable). */
export function thinContentReasons(input: {
  status: string;
  chapters: { chapter_number: number; content: string }[];
  hasReadme: boolean | null;
}): string[] {
  const reasons: string[] = [];
  if (input.status !== "ready") reasons.push("not_ready");
  const nums = new Set(input.chapters.map((c) => c.chapter_number));
  if (![1, 2, 3].every((n) => nums.has(n))) reasons.push("missing_chapters");
  const ch1 = input.chapters.find((c) => c.chapter_number === 1);
  if (!ch1 || wordCount(ch1.content) < 600) reasons.push("chapter1_short");
  const all = input.chapters.map((c) => c.content).join("\n\n");
  if (/^#{1,6}\s*$/m.test(all)) reasons.push("empty_heading");
  if (REFUSAL.test(all)) reasons.push("ai_refusal");
  const paras = all
    .split(/\n\s*\n/)
    .map((p) => p.trim().toLowerCase().replace(/\s+/g, " "))
    .filter((p) => p.length >= 40);
  if (paras.length) {
    const dupes = paras.length - new Set(paras).size;
    if (dupes / paras.length > 0.3) reasons.push("duplicate_paragraphs");
  }
  if (input.hasReadme !== true) reasons.push("no_readme");
  return reasons;
}

/** FR-6.4 JSON-LD. Never names who generated the guide. */
export function levelJsonLd(p: { fullName: string; repoKey: string; level: number; description: string; readyAt: string | null }) {
  return {
    "@context": "https://schema.org",
    "@type": "LearningResource",
    name: `${p.fullName} — ${levelName(p.level)} guide (${p.level})`,
    description: p.description,
    url: `${SITE_URL}${levelPath(p.repoKey, p.level)}`,
    educationalLevel: `${p.level} ${levelName(p.level)}`,
    learningResourceType: "Textbook",
    inLanguage: "en",
    isBasedOn: `https://github.com/${p.fullName}`,
    ...(p.readyAt ? { dateModified: p.readyAt } : {}),
    publisher: { "@type": "Organization", name: "AppToText", url: SITE_URL },
  };
}

/** Safe for <script type="application/ld+json">. */
export function jsonLdScript(data: unknown): string {
  return JSON.stringify(data).replace(/</g, "\\u003c");
}
