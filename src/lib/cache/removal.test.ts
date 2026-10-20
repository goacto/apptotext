import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { checkOwnership, hashIp, isValidEmail, recheckRepoVisibility, STRIKE_GAP_MS } from "./removal";
import { getEmailProvider, logProvider, maskEmail, resendProvider, sendEmail } from "@/lib/email";
import { removalAckEmail, removalDoneEmail } from "@/lib/email/templates";
import type { RepoMeta } from "@/lib/github/api";

const read = (f: string) => readFileSync(join(process.cwd(), f), "utf8");
const sql = read("supabase/migrations/20261020_cache_p4_removal.sql").toLowerCase();

const meta = (o: Partial<RepoMeta> = {}): RepoMeta => ({
  github_repo_id: 7,
  full_name: "Acme/Widget",
  owner: "Acme",
  name: "Widget",
  repo_key: "acme/widget",
  private: false,
  visibility: "public",
  default_branch: "main",
  archived: false,
  fork: false,
  parent_full_name: null,
  language: "TypeScript",
  stars: 1,
  description: null,
  forks: 0,
  topics: [],
  owner_type: "User",
  ...o,
});

describe("PR 4 migration", () => {
  it("new tables are service-role only", () => {
    for (const t of ["removal_requests", "do_not_cache", "cron_runs"]) {
      expect(sql).toContain(`alter table public.${t} enable row level security`);
    }
    expect(sql).toContain("revoke all on public.removal_requests, public.do_not_cache, public.cron_runs from anon, authenticated");
    expect(sql).not.toMatch(/create policy/);
  });
  it("functions are service-role only and withdraw purges content but keeps the tombstone row", () => {
    for (const f of ["is_do_not_cache(bigint, text)", "withdraw_repo(bigint, text)", "purge_withdrawn_versions()"]) {
      expect(sql).toContain(`revoke execute on function public.${f} from public, anon, authenticated`);
      expect(sql).toContain(`grant execute on function public.${f} to service_role`);
    }
    expect(sql).toContain("delete from public.guide_chapters where guide_version_id = any(v_ids)");
    expect(sql).toContain("set purged_at = now()");
    expect(sql).not.toMatch(/delete from public\.guide_versions/);
    expect(sql).toContain("update public.conversions set is_public = false");
  });
  it("do-not-cache is keyed by github_repo_id (survives renames) with optional owner wildcard", () => {
    expect(sql).toContain("create unique index if not exists do_not_cache_repo_id on public.do_not_cache (github_repo_id)");
    expect(sql).toContain("d.owner_wildcard and lower(d.owner) = split_part(lower(p_repo_key), '/', 1)");
  });
  it("share is blocked for private / do-not-cache repos", () => {
    expect(sql).toContain("create trigger guard_conversion_share before update of is_public on public.conversions");
  });
});

describe("ownership verification (FR-7.2)", () => {
  const noFile = vi.fn().mockResolvedValue(new Response("", { status: 404 }));
  it("(a) GitHub sign-in as the owner", async () => {
    const user = { identities: [{ provider: "github", identity_data: { user_name: "acme" } }] } as never;
    expect(await checkOwnership(meta(), "tok", user, noFile)).toBe("github_signin");
    const other = { identities: [{ provider: "github", identity_data: { user_name: "mallory" } }] } as never;
    expect(await checkOwnership(meta(), "tok", other, noFile)).toBeNull();
  });
  it("(b) topic or file with the token", async () => {
    expect(await checkOwnership(meta({ topics: ["apptotext-optout"] }), "tok", null, noFile)).toBe("repo_topic");
    const file = vi.fn().mockResolvedValue(new Response("a2t-123\n"));
    expect(await checkOwnership(meta(), "a2t-123", null, file)).toBe("repo_file");
    expect(file.mock.calls[0][0]).toBe("https://raw.githubusercontent.com/Acme/Widget/main/.apptotext-optout");
    const wrong = vi.fn().mockResolvedValue(new Response("a2t-999"));
    expect(await checkOwnership(meta(), "a2t-123", null, wrong)).toBeNull();
  });
});

function fakeAdmin() {
  const calls: { table: string; op: string; values?: unknown }[] = [];
  const chain = (table: string, op: string, values?: unknown) => {
    calls.push({ table, op, values });
    const c = { eq: () => c, then: (r: (v: unknown) => unknown) => r({ data: null, error: null }) };
    return c;
  };
  const admin = {
    from: (t: string) => ({ update: (v: unknown) => chain(t, "update", v) }),
    rpc: vi.fn((name: string, args: unknown) => {
      calls.push({ table: name, op: "rpc", values: args });
      return Promise.resolve({ data: 1, error: null });
    }),
  } as unknown as SupabaseClient;
  return { admin, calls };
}

describe("visibility re-check (FR-5.4)", () => {
  const repo = { github_repo_id: 7, full_name: "Acme/Widget", first_strike_at: null as string | null };
  const now = Date.parse("2026-10-21T08:00:00Z");
  it("public resets strikes", async () => {
    const { admin, calls } = fakeAdmin();
    expect(await recheckRepoVisibility(admin, repo, now, async () => meta())).toBe("public");
    expect(calls[0].values).toMatchObject({ is_public: true, private_strikes: 0, first_strike_at: null });
  });
  it("a first 404 is a strike that unlists but does not withdraw", async () => {
    const { admin, calls } = fakeAdmin();
    expect(await recheckRepoVisibility(admin, repo, now, async () => null)).toBe("strike");
    expect(calls.some((c) => c.op === "rpc")).toBe(false);
    expect(calls.find((c) => c.table === "guide_versions")?.values).toEqual({ listed: false, indexable: false });
  });
  it("a second 404 at least 1h later withdraws; sooner waits", async () => {
    const first = new Date(now - STRIKE_GAP_MS).toISOString();
    const a = fakeAdmin();
    expect(await recheckRepoVisibility(a.admin, { ...repo, first_strike_at: first }, now, async () => null)).toBe("withdrawn");
    expect(a.calls.find((c) => c.op === "rpc")).toMatchObject({ table: "withdraw_repo", values: { p_github_repo_id: 7, p_reason: "repo_private" } });
    const b = fakeAdmin();
    const recent = new Date(now - STRIKE_GAP_MS + 60_000).toISOString();
    expect(await recheckRepoVisibility(b.admin, { ...repo, first_strike_at: recent }, now, async () => null)).toBe("skipped");
  });
  it("private:true withdraws immediately", async () => {
    const { admin, calls } = fakeAdmin();
    expect(await recheckRepoVisibility(admin, repo, now, async () => meta({ private: true, visibility: "private" }))).toBe("withdrawn");
    expect(calls.some((c) => c.op === "rpc")).toBe(true);
  });
});

describe("email provider (no real sends unless configured)", () => {
  it("logs when RESEND_API_KEY / EMAIL_FROM are unset", () => {
    expect(getEmailProvider({ VERCEL_ENV: "production" }).name).toBe("log");
    expect(getEmailProvider({ VERCEL_ENV: "production", RESEND_API_KEY: "k" }).name).toBe("log");
    expect(getEmailProvider({ VERCEL_ENV: "preview", RESEND_API_KEY: "k", EMAIL_FROM: "a@b.c" }).name).toBe("log");
    expect(getEmailProvider({ VERCEL_ENV: "production", RESEND_API_KEY: "k", EMAIL_FROM: "a@b.c", EMAIL_DRY_RUN: "1" }).name).toBe("log");
    expect(getEmailProvider({ VERCEL_ENV: "production", RESEND_API_KEY: "k", EMAIL_FROM: "a@b.c" }).name).toBe("resend");
  });
  it("resend provider posts the message", async () => {
    const f = vi.fn().mockResolvedValue(new Response(JSON.stringify({ id: "em_1" }), { status: 200 }));
    const r = await resendProvider("key", "AppToText <noreply@apptotext.com>", f).send({ to: "o@acme.dev", subject: "s", text: "t", template: "x" });
    expect(r).toEqual({ delivered: true, provider: "resend", id: "em_1" });
    const [url, init] = f.mock.calls[0];
    expect(url).toBe("https://api.resend.com/emails");
    expect(JSON.parse(init.body)).toEqual({ from: "AppToText <noreply@apptotext.com>", to: ["o@acme.dev"], subject: "s", text: "t" });
  });
  it("reserved test domains never reach a real provider", async () => {
    const real = { name: "resend" as const, send: vi.fn() };
    const r = await sendEmail({ to: "x@example.com", subject: "s", text: "t", template: "x" }, real);
    expect(real.send).not.toHaveBeenCalled();
    expect(r.provider).toBe("log");
  });
  it("masks recipients in logs", async () => {
    expect(maskEmail("owner@acme.dev")).toBe("o***@acme.dev");
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    await logProvider.send({ to: "owner@acme.dev", subject: "s", text: "secret body", template: "x" });
    expect(spy.mock.calls[0].join(" ")).not.toContain("owner@acme.dev");
    expect(spy.mock.calls[0].join(" ")).not.toContain("secret body");
    spy.mockRestore();
  });
  it("copy says we and matches FR-7.1", () => {
    const ack = removalAckEmail("acme/widget", "r1", "a2t-x");
    expect(ack.text).toContain("We received your request for acme/widget. We'll confirm within 2 business days, or within 1 hour if you verify ownership below.");
    expect(removalDoneEmail("acme/widget", true).text).toContain("do-not-cache");
  });
});

describe("misc", () => {
  it("hashes IPs with a key and validates emails", () => {
    expect(hashIp("1.2.3.4", "k")).toBe(hashIp("1.2.3.4", "k"));
    expect(hashIp("1.2.3.4", "k")).not.toContain("1.2.3.4");
    expect(isValidEmail("a@b.co")).toBe(true);
    expect(isValidEmail("nope")).toBe(false);
  });
  it("daily cron is configured once a day (Hobby)", () => {
    const v = JSON.parse(read("vercel.json"));
    expect(v.crons).toEqual([{ path: "/api/cron/daily", schedule: "0 8 * * *" }]);
  });
  it("remove route has a honeypot and a durable per-IP daily limit", () => {
    const src = read("src/app/api/library/remove/route.ts");
    expect(src).toContain("body.website");
    expect(src).toContain("REMOVAL_IP_LIMIT_PER_DAY");
    expect(src).toContain('.eq("ip_hash", ipHash)');
  });
});
