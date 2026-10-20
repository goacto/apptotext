import { describe, expect, it } from "vitest";
import {
  canonicalRedirect,
  descriptionFrom,
  jsonLdScript,
  levelJsonLd,
  levelPath,
  levelSlug,
  levelTitle,
  parseLevelSlug,
  removalLink,
  thinContentReasons,
} from "./seo";
import { libraryRepoFromPath } from "./gone";
import { latestPerLevel, libraryCards, type ListedVersion, type LibraryRepo } from "./data";

const words = (n: number, tag = "w") => Array.from({ length: n }, (_, i) => `${tag}${i}`).join(" ");

describe("slugs and canonical 308s (FR-6.2)", () => {
  it("builds and parses level slugs", () => {
    expect(levelSlug(101)).toBe("101-beginner");
    expect(levelSlug(501)).toBe("501-principal");
    expect(parseLevelSlug("101")).toBe(101);
    expect(parseLevelSlug("301-ADVANCED")).toBe(301);
    expect(parseLevelSlug("999-x")).toBeNull();
    expect(parseLevelSlug("abc")).toBeNull();
  });
  it("redirects non-canonical casing, bare levels and renamed repos", () => {
    expect(canonicalRedirect("vercel", "next.js", null, "vercel/next.js")).toBeNull();
    expect(canonicalRedirect("Vercel", "Next.js", null, "vercel/next.js")).toBe("/library/vercel/next.js");
    expect(canonicalRedirect("vercel", "next.js", "101-beginner", "vercel/next.js")).toBeNull();
    expect(canonicalRedirect("Vercel", "Next.js", "101", "vercel/next.js")).toBe("/library/vercel/next.js/101-beginner");
    expect(canonicalRedirect("zeit", "next.js", "101-beginner", "vercel/next.js")).toBe("/library/vercel/next.js/101-beginner");
  });
  it("paths and removal link (FR-6.8)", () => {
    expect(levelPath("a/b", 201)).toBe("/library/a/b/201-intermediate");
    expect(removalLink("a/b")).toBe("/library/remove?repo=a%2Fb");
  });
});

describe("metadata (FR-6.4)", () => {
  it("title fits 60 chars with fallbacks", () => {
    expect(levelTitle("vercel/next.js", 101)).toBe("vercel/next.js — Beginner guide (101) | AppToText");
    const long = levelTitle("some-very-long-organisation-name/another-long-repo", 501);
    expect(long.length).toBeLessThanOrEqual(60);
  });
  it("description is prose only, <= 155 chars", () => {
    const md = "# Title\n\n```js\ncode()\n```\n\n- bullet\n\nThis is **real** prose about `escape()` and [links](http://x). " + words(60);
    const d = descriptionFrom(md);
    expect(d.startsWith("This is real prose about escape() and links.")).toBe(true);
    expect(d.length).toBeLessThanOrEqual(155);
    expect(d).not.toContain("#");
  });
  it("JSON-LD is a LearningResource and never names the generator", () => {
    const ld = levelJsonLd({ fullName: "a/b", repoKey: "a/b", level: 101, description: "d", readyAt: "2026-10-20T00:00:00Z" });
    expect(ld["@type"]).toBe("LearningResource");
    expect(ld.isBasedOn).toBe("https://github.com/a/b");
    expect(ld.dateModified).toBe("2026-10-20T00:00:00Z");
    expect(JSON.stringify(ld)).not.toMatch(/user|email|author/i);
    expect(jsonLdScript({ x: "</script>" })).not.toContain("</script>");
  });
});

describe("thin-content rule (FR-6.6)", () => {
  const good = [
    { chapter_number: 1, content: words(700, "a") },
    { chapter_number: 2, content: words(700, "b") },
    { chapter_number: 3, content: words(700, "c") },
  ];
  it("passes a complete ready guide with README", () => {
    expect(thinContentReasons({ status: "ready", chapters: good, hasReadme: true })).toEqual([]);
  });
  it("flags each failure", () => {
    expect(thinContentReasons({ status: "ready", chapters: good.slice(0, 2), hasReadme: true })).toContain("missing_chapters");
    expect(thinContentReasons({ status: "ready", chapters: [{ chapter_number: 1, content: words(500) }, ...good.slice(1)], hasReadme: true })).toContain("chapter1_short");
    expect(thinContentReasons({ status: "ready", chapters: good, hasReadme: false })).toContain("no_readme");
    expect(thinContentReasons({ status: "ready", chapters: good, hasReadme: null })).toContain("no_readme");
    expect(thinContentReasons({ status: "withdrawn", chapters: good, hasReadme: true })).toContain("not_ready");
    const empty = [{ chapter_number: 1, content: words(700) + "\n\n## \n\nmore" }, ...good.slice(1)];
    expect(thinContentReasons({ status: "ready", chapters: empty, hasReadme: true })).toContain("empty_heading");
    const refusal = [{ chapter_number: 1, content: words(700) + "\n\nI cannot help with that request." }, ...good.slice(1)];
    expect(thinContentReasons({ status: "ready", chapters: refusal, hasReadme: true })).toContain("ai_refusal");
    const para = "This paragraph is repeated many times across the chapter text here.";
    const dup = [{ chapter_number: 1, content: words(700) + `\n\n${para}\n\n${para}\n\n${para}\n\n${para}` }, ...good.slice(1)];
    expect(thinContentReasons({ status: "ready", chapters: dup, hasReadme: true })).toContain("duplicate_paragraphs");
  });
});

describe("410 path matching (FR-5.5)", () => {
  it("matches repo and level pages, not /library or /library/remove", () => {
    expect(libraryRepoFromPath("/library/Vercel/Next.js")).toEqual({ repoKey: "vercel/next.js", level: null });
    expect(libraryRepoFromPath("/library/a/b/101-beginner")).toEqual({ repoKey: "a/b", level: 101 });
    expect(libraryRepoFromPath("/library")).toBeNull();
    expect(libraryRepoFromPath("/library/remove")).toBeNull();
    expect(libraryRepoFromPath("/library/remove/x")).toBeNull();
    expect(libraryRepoFromPath("/conversion/abc")).toBeNull();
  });
});

describe("library listing", () => {
  const repo = (id: number, key: string, language: string | null): LibraryRepo => ({
    github_repo_id: id, repo_key: key, full_name: key, language, stars: 1, is_public: true,
  });
  const v = (id: string, rid: number, level: number, ready: string): ListedVersion => ({
    id, github_repo_id: rid, repo_key: "", level, commit_sha: "x".repeat(40), ready_at: ready, indexable: true,
  });
  it("keeps the newest version per repo/level", () => {
    const out = latestPerLevel([v("old", 1, 101, "2026-01-01"), v("new", 1, 101, "2026-02-01"), v("b", 1, 201, "2026-01-05")]);
    expect(out.map((x) => x.id).sort()).toEqual(["b", "new"]);
  });
  it("filters by level and language and paginates by 24", () => {
    const repos = new Map<number, LibraryRepo>();
    const versions: ListedVersion[] = [];
    for (let i = 1; i <= 30; i++) {
      repos.set(i, repo(i, `o/r${i}`, i % 2 ? "TypeScript" : "Go"));
      versions.push(v(`v${i}`, i, i % 3 ? 101 : 201, `2026-01-${String(i).padStart(2, "0")}`));
    }
    const all = libraryCards(versions, repos, {});
    expect(all.total).toBe(30);
    expect(all.pages).toBe(2);
    expect(all.cards).toHaveLength(24);
    expect(all.cards[0].repo.repo_key).toBe("o/r30");
    expect(libraryCards(versions, repos, { page: 2 }).cards).toHaveLength(6);
    expect(libraryCards(versions, repos, { level: 201 }).total).toBe(10);
    expect(libraryCards(versions, repos, { lang: "go" }).total).toBe(15);
  });
});
