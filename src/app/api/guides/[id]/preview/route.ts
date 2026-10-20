import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { rateLimit } from "@/lib/rate-limit";
import { getGuidePreview } from "@/lib/cache/preview";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function clientIp(request: NextRequest): string {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "unknown";
}

/**
 * FR-3.1 / US-3: preview of a cached level. Open to signed-out visitors and Free users.
 * Chapter 1 in full; chapters 2-3, flashcards and quiz as titles/counts only. No rows are copied.
 * FR-8.1: 120 preview reads per IP per hour.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID.test(id)) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { allowed } = rateLimit(`guides-preview:${clientIp(request)}`, 120, 3_600_000);
  if (!allowed) return NextResponse.json({ error: "Too many requests. Please wait a moment." }, { status: 429 });

  const preview = await getGuidePreview(createAdminClient(), id);
  if (!preview) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(preview, { headers: { "Cache-Control": "private, max-age=60" } });
}
