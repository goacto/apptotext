import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { CHECKOUT_SOURCES, limitWallCopy, upgradeOptions } from "./plans";

const read = (f: string) => readFileSync(join(process.cwd(), f), "utf8");

describe("limit wall: which plans are offered", () => {
  it("free sees all three paid plans at the existing prices", () => {
    expect(upgradeOptions("free").map((p) => [p.id, p.priceCents, p.limit])).toEqual([
      ["standard", 499, 3],
      ["pro", 999, 6],
      ["master", 1499, 10],
    ]);
  });
  it("paid users see only the tiers above theirs", () => {
    expect(upgradeOptions("standard").map((p) => p.id)).toEqual(["pro", "master"]);
    expect(upgradeOptions("pro").map((p) => p.id)).toEqual(["master"]);
    expect(upgradeOptions("master")).toEqual([]);
  });
});

describe("limit wall copy", () => {
  it("free copy names the lifetime limit and the lowest price", () => {
    const c = limitWallCopy("free", 1);
    expect(c.title).toBe("You've used your free guide");
    expect(c.body).toContain("1 generation.");
    expect(c.body).toContain("$4.99/month");
  });
  it("paid copy names the plan and its monthly limit", () => {
    expect(limitWallCopy("standard", 3).body).toContain("Standard includes 3 generations per month");
    expect(limitWallCopy("pro", 6).body).toContain("Move up a plan");
    expect(limitWallCopy("master", 10).body).toContain("resets at the start of your next billing cycle");
  });
  it("public copy never uses a person's name or banned brand words", () => {
    const files = [
      "src/lib/plans.ts",
      "src/components/upgrade/limit-wall-card.tsx",
      "src/components/guides/guide-preview.tsx",
      "src/components/library/library-footer.tsx",
      "src/app/library/page.tsx",
    ];
    for (const f of files) expect(read(f)).not.toMatch(/zach|etched/i);
    for (const p of ["free", "standard", "pro", "master"] as const) {
      expect(JSON.stringify(limitWallCopy(p, 3))).not.toMatch(/zach|etched/i);
    }
  });
});

describe("wiring", () => {
  it("generate route returns limit_reached with plan and limit on the 403", () => {
    const src = read("src/app/api/generate/route.ts");
    expect(src).toMatch(/limit_reached: true, plan, limit/);
    expect(src).toContain('upgrade_required: plan === "free"');
  });
  it("checkout accepts the limit_wall source tag; still inline price_data, no price/product writes", () => {
    expect(CHECKOUT_SOURCES).toEqual(["guide_preview", "limit_wall"]);
    const src = read("src/app/api/stripe/checkout/route.ts");
    expect(src).toContain("CHECKOUT_SOURCES.includes(body.source)");
    expect(src).not.toMatch(/prices\.create|products\.create|prices\.update|products\.update/);
  });
  it("paid users change plan via the billing portal, never a second checkout", () => {
    const src = read("src/components/upgrade/limit-wall-card.tsx");
    expect(src).toMatch(/isPaid\s*\?\s*await fetch\("\/api\/stripe\/portal"/);
    expect(src).toContain('const isPaid = plan !== "free"');
  });
  it("conversion page shows the limit wall card on limit_reached", () => {
    const src = read("src/app/conversion/[id]/page.tsx");
    expect(src).toContain("errorData?.limit_reached");
    expect(src).toContain("<LimitWallCard");
  });
  it("preview has a CTA at the chapter-1 cutoff with a Pricing link", () => {
    const src = read("src/components/guides/guide-preview.tsx");
    expect(src).toContain('data-testid="preview-cutoff-cta"');
    expect(src).toContain('href="/pricing"');
    expect(src.indexOf("preview-cutoff-cta")).toBeGreaterThan(src.indexOf("preview.chapter1.content"));
    expect(src.indexOf("preview-cutoff-cta")).toBeLessThan(src.indexOf('aria-label="Locked content"'));
  });
  it("Pricing is linked in the nav, on /library and in the library footer", () => {
    expect(read("src/components/layout/header.tsx")).toContain('href: "/pricing"');
    expect(read("src/app/library/page.tsx")).toContain('href="/pricing"');
    expect(read("src/components/library/library-footer.tsx")).toContain('href="/pricing"');
  });
});
