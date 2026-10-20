import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Streaming AI routes must outlive one full model response (claude-sonnet-4-6, max_tokens 8192).
// Vercel Hobby with Fluid compute caps maxDuration at 300s.
describe("AI route maxDuration", () => {
  for (const route of ["generate", "chat"]) {
    it(`${route} route allows 300s`, () => {
      const src = readFileSync(join(process.cwd(), "src/app/api", route, "route.ts"), "utf8");
      const m = src.match(/export const maxDuration = (\d+);/);
      expect(m).not.toBeNull();
      expect(Number(m![1])).toBe(300);
    });
  }
});
