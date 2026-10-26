import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const from = vi.fn();

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({ from }),
}));

vi.mock("@/lib/github/api", () => ({
  fetchRepoMeta: vi.fn(),
  publicToken: () => "",
}));

vi.mock("@/lib/cache/removal", () => ({
  REPO_PROOF_DAYS: 7,
  appendEvent: vi.fn(),
  checkOwnership: vi.fn(),
  githubBudgetOk: () => false,
  recheckRepoVisibility: vi.fn(),
  takedown: vi.fn(),
}));

import { GET } from "./route";

const previous = process.env.CRON_SECRET;

afterEach(() => {
  from.mockReset();
  if (previous === undefined) delete process.env.CRON_SECRET;
  else process.env.CRON_SECRET = previous;
});

describe("GET /api/cron/daily", () => {
  it("returns 401 and does not touch the database when unauthenticated", async () => {
    delete process.env.CRON_SECRET;
    const res = await GET(new NextRequest("http://localhost/api/cron/daily"));
    expect(res.status).toBe(401);
    expect(from).not.toHaveBeenCalled();
  });

  it("accepts the Vercel cron schedule header", async () => {
    delete process.env.CRON_SECRET;
    from.mockReturnValue({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: { last_started_at: new Date().toISOString() } }),
        }),
      }),
    });
    const res = await GET(
      new NextRequest("http://localhost/api/cron/daily", {
        headers: { "x-vercel-cron-schedule": "0 8 * * *" },
      })
    );
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({ skipped: true });
  });
});
