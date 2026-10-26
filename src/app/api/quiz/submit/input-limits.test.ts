import { describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { QUIZ_MAX_ANSWERS } from "@/lib/ai/input-limits";

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: "user-1" } }, error: null }) },
  }),
}));

import { POST } from "./route";

describe("POST /api/quiz/submit input caps", () => {
  it("rejects more answers than the cap", async () => {
    const answers = Array.from({ length: QUIZ_MAX_ANSWERS + 1 }, (_, i) => ({
      question_id: `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`,
      selected: 0,
    }));
    const res = await POST(
      new NextRequest("http://localhost/api/quiz/submit", {
        method: "POST",
        body: JSON.stringify({ conversion_id: "3f1c0c2e-1b4a-4d2e-9a7b-0c1d2e3f4a5b", level: 101, answers }),
      })
    );
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toMatchObject({ error: "Too many answers" });
  });
});
