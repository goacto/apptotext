import { describe, expect, it } from "vitest";
import { normalizeRepo } from "./normalize";

describe("normalizeRepo (FR-1.1)", () => {
  it.each([
    ["https://github.com/Vercel/Next.js.git", "vercel/next.js"],
    ["https://www.github.com/vercel/next.js/", "vercel/next.js"],
    ["https://github.com/vercel/next.js/tree/canary/packages", "vercel/next.js"],
    ["https://github.com/vercel/next.js/blob/main/README.md?x=1#top", "vercel/next.js"],
    ["github.com/Facebook/React", "facebook/react"],
    ["Facebook/React", "facebook/react"],
    ["http://GitHub.com/a-b/c_d.e", "a-b/c_d.e"],
  ])("%s -> %s", (input, key) => {
    expect(normalizeRepo(input)?.repoKey).toBe(key);
  });

  it("keeps display casing in owner/name", () => {
    expect(normalizeRepo("https://github.com/Vercel/Next.js.git")).toEqual({
      owner: "Vercel",
      name: "Next.js",
      repoKey: "vercel/next.js",
    });
  });

  it.each(["https://gitlab.com/a/b", "https://github.com/onlyowner", "", "not a url", "https://github.com/a/..", "https://evilgithub.com/a/b"])(
    "rejects %s",
    (input) => {
      expect(normalizeRepo(input)).toBeNull();
    }
  );
});
