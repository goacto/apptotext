import { describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { AI_ID_MAX_CHARS } from "@/lib/ai/input-limits";

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: "user-1" } }, error: null }) },
  }),
}));

import { POST } from "./route";

describe("POST /api/flashcards/review input caps", () => {
  it("rejects an oversized flashcard_id", async () => {
    const res = await POST(
      new NextRequest("http://localhost/api/flashcards/review", {
        method: "POST",
        body: JSON.stringify({ flashcard_id: "f".repeat(AI_ID_MAX_CHARS + 1), quality: 4 }),
      })
    );
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toMatchObject({ error: "flashcard_id is too long" });
  });
});
