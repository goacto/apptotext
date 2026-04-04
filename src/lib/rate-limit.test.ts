import { describe, it, expect, beforeEach } from "vitest";
import { rateLimit } from "./rate-limit";

describe("rateLimit", () => {
  // Each test uses a unique identifier to avoid cross-test pollution

  it("allows requests within the limit", () => {
    const id = `test-allow-${Date.now()}`;
    const result = rateLimit(id, 5, 60_000);
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(4);
  });

  it("blocks requests exceeding the limit", () => {
    const id = `test-block-${Date.now()}`;
    for (let i = 0; i < 3; i++) {
      rateLimit(id, 3, 60_000);
    }
    const result = rateLimit(id, 3, 60_000);
    expect(result.allowed).toBe(false);
    expect(result.remaining).toBe(0);
  });

  it("allows requests after window expires", async () => {
    const id = `test-expire-${Date.now()}`;
    // Use a very short window
    rateLimit(id, 1, 50);
    const blocked = rateLimit(id, 1, 50);
    expect(blocked.allowed).toBe(false);

    // Wait for window to expire
    await new Promise((r) => setTimeout(r, 60));
    const allowed = rateLimit(id, 1, 50);
    expect(allowed.allowed).toBe(true);
  });

  it("tracks different identifiers independently", () => {
    const id1 = `test-indep-a-${Date.now()}`;
    const id2 = `test-indep-b-${Date.now()}`;

    rateLimit(id1, 1, 60_000);
    const blocked = rateLimit(id1, 1, 60_000);
    expect(blocked.allowed).toBe(false);

    const allowed = rateLimit(id2, 1, 60_000);
    expect(allowed.allowed).toBe(true);
  });

  it("returns correct remaining count", () => {
    const id = `test-remaining-${Date.now()}`;
    expect(rateLimit(id, 5, 60_000).remaining).toBe(4);
    expect(rateLimit(id, 5, 60_000).remaining).toBe(3);
    expect(rateLimit(id, 5, 60_000).remaining).toBe(2);
    expect(rateLimit(id, 5, 60_000).remaining).toBe(1);
    expect(rateLimit(id, 5, 60_000).remaining).toBe(0);
  });
});
