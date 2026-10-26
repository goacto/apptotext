import { describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { AI_ID_MAX_CHARS } from "@/lib/ai/input-limits";

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: "user-1" } }, error: null }) },
  }),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({}),
}));

vi.mock("@/lib/limits", () => ({
  durableRateLimit: async () => true,
  aiCapReached: async () => ({ reached: false }),
  regenerateBlocked: () => false,
  CAPACITY_MESSAGE: "cap",
  REGENERATE_COOLDOWN_MESSAGE: "cool",
}));

import { POST } from "./route";

describe("POST /api/generate input caps", () => {
  it("rejects an oversized conversion_id before generation", async () => {
    const res = await POST(
      new NextRequest("http://localhost/api/generate", {
        method: "POST",
        body: JSON.stringify({
          conversion_id: "x".repeat(AI_ID_MAX_CHARS + 1),
          level: 101,
          ai_provider: "claude",
          phase: "chapter",
        }),
      })
    );
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toMatchObject({ error: "conversion_id is too long" });
  });
});
