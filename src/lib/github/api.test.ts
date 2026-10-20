import { describe, expect, it } from "vitest";
import { repoMetaFromApi, shaLookupMode } from "./api";
import { pickReadme, sha256 } from "./source";

describe("shaLookupMode (FR-1.5)", () => {
  const now = 1_000_000;
  it("fresh when unknown or healthy", () => {
    expect(shaLookupMode({ remaining: null, resetAt: null }, now)).toBe("fresh");
    expect(shaLookupMode({ remaining: 4000, resetAt: now + 1000 }, now)).toBe("fresh");
  });
  it("stale_ok below 500", () => {
    expect(shaLookupMode({ remaining: 499, resetAt: now + 1000 }, now)).toBe("stale_ok");
  });
  it("blocked below 100 until reset", () => {
    expect(shaLookupMode({ remaining: 99, resetAt: now + 1000 }, now)).toBe("blocked");
    expect(shaLookupMode({ remaining: 0, resetAt: now - 1 }, now)).toBe("fresh");
  });
});

describe("repoMetaFromApi (FR-1.2)", () => {
  it("maps id, key and visibility", () => {
    const m = repoMetaFromApi({
      id: 70107786,
      full_name: "Vercel/Next.js",
      private: false,
      visibility: "public",
      default_branch: "canary",
      stargazers_count: 5,
      fork: true,
      parent: { full_name: "x/y" },
    });
    expect(m).toMatchObject({
      github_repo_id: 70107786,
      repo_key: "vercel/next.js",
      owner: "Vercel",
      name: "Next.js",
      private: false,
      visibility: "public",
      default_branch: "canary",
      fork: true,
      parent_full_name: "x/y",
    });
  });
  it("treats missing visibility on private repos as private", () => {
    expect(repoMetaFromApi({ id: 1, full_name: "a/b", private: true }).visibility).toBe("private");
  });
});

describe("source helpers (FR-1.7)", () => {
  it("picks a root README, preferring markdown", () => {
    expect(pickReadme(["docs/README.md", "README.rst", "README.md"])).toBe("README.md");
    expect(pickReadme(["readme.txt"])).toBe("readme.txt");
    expect(pickReadme(["docs/README.md"])).toBeNull();
  });
  it("hashes with sha256", () => {
    expect(sha256("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  });
});
