import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { chargeGenerationOnce } from "./subscription";

const sql = readFileSync(join(process.cwd(), "supabase/migrations/20261020_quota_charge_once.sql"), "utf8").toLowerCase();
const route = readFileSync(join(process.cwd(), "src/app/api/generate/route.ts"), "utf8");

describe("quota charge-once migration", () => {
  it("makes chapter rows unique per conversion/level/number", () => {
    expect(sql).toContain("on public.chapters (conversion_id, level, chapter_number)");
    expect(sql).toMatch(/create unique index/);
  });
  it("records charges once per (conversion, level), service-role only", () => {
    expect(sql).toContain("primary key (conversion_id, level)");
    expect(sql).toContain("on conflict (conversion_id, level) do nothing");
    expect(sql).toContain("revoke all on public.quota_charges from anon, authenticated");
    expect(sql).toMatch(/revoke execute on function public\.charge_generation_once\(uuid, uuid, integer, uuid\) from public, anon, authenticated/);
  });
  it("skips the charge when the user already paid for the shared version", () => {
    expect(sql).toContain("if v_payer = p_user then");
  });
});

describe("generate route", () => {
  it("upserts chapters and charges through charge_generation_once", () => {
    expect(route).toContain('onConflict: "conversion_id,level,chapter_number"');
    expect(route).toContain("chargeGenerationOnce(");
    expect(route).not.toContain("incrementGenerationCount(");
    expect(route).toContain("quota_charged: charged");
  });
});

describe("chargeGenerationOnce", () => {
  const client = (data: unknown, error: unknown = null) =>
    ({ rpc: vi.fn().mockResolvedValue({ data, error }) }) as unknown as SupabaseClient & { rpc: ReturnType<typeof vi.fn> };
  it("returns true only when the DB charged", async () => {
    const c = client(true);
    expect(await chargeGenerationOnce(c, "u", "c", 101, "v")).toBe(true);
    expect(c.rpc).toHaveBeenCalledWith("charge_generation_once", { p_user: "u", p_conversion: "c", p_level: 101, p_version: "v" });
    expect(await chargeGenerationOnce(client(false), "u", "c", 101, null)).toBe(false);
  });
  it("never reports a charge on error", async () => {
    expect(await chargeGenerationOnce(client(null, { message: "boom" }), "u", "c", 101, null)).toBe(false);
  });
});
