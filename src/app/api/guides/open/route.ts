import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { rateLimit } from "@/lib/rate-limit";
import { canGenerate, getUserSubscription, incrementGenerationCount, planFromStatus } from "@/lib/subscription";
import { copyVersionToConversion } from "@/lib/cache/guides";
import { recordLedger } from "@/lib/ledger";

const VALID_LEVELS = [101, 201, 301, 401, 501];

/**
 * FR-2.2 / FR-2.3: open a cached guide level into the user's own conversion.
 * Subscribers: free (no AI call, no quota). Free plan: spends one generation (Zach Q3).
 */
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Authentication required" }, { status: 401 });

  const { allowed: rateOk } = rateLimit(`guides-open:${user.id}`, 60, 3_600_000);
  if (!rateOk) return NextResponse.json({ error: "Too many requests. Please wait a moment." }, { status: 429 });

  const body = (await request.json().catch(() => ({}))) as { conversion_id?: string; level?: number; version_id?: string };
  if (!body.conversion_id || !body.version_id || !VALID_LEVELS.includes(Number(body.level))) {
    return NextResponse.json({ error: "conversion_id, level and version_id are required" }, { status: 400 });
  }
  const level = Number(body.level);

  const { data: conversion } = await supabase
    .from("conversions")
    .select("id, user_id, repo_key")
    .eq("id", body.conversion_id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!conversion) return NextResponse.json({ error: "Conversion not found" }, { status: 404 });

  const admin = createAdminClient();
  const { data: version } = await admin
    .from("guide_versions")
    .select("id, repo_key, level, status")
    .eq("id", body.version_id)
    .maybeSingle();
  if (!version || version.status !== "ready" || version.repo_key !== conversion.repo_key || version.level !== level) {
    return NextResponse.json({ error: "Cached guide not available" }, { status: 404 });
  }

  const { data: existing } = await supabase
    .from("chapters")
    .select("id")
    .eq("conversion_id", conversion.id)
    .eq("level", level)
    .limit(1);
  if (existing && existing.length) {
    return NextResponse.json({ error: "Content already exists for this level." }, { status: 409 });
  }

  const sub = await getUserSubscription(supabase, user.id);
  const plan = planFromStatus(sub?.subscription_status);
  let charged = false;
  if (plan === "free") {
    const { allowed } = await canGenerate(supabase, user.id);
    if (!allowed) {
      return NextResponse.json(
        {
          error: "Unlock the full guide, flashcards and quiz. Plans start at $4.99/month.",
          upgrade_required: true,
          preview_available: true,
        },
        { status: 403 }
      );
    }
    await incrementGenerationCount(admin, user.id);
    charged = true;
  }

  try {
    const counts = await copyVersionToConversion(admin, version.id, conversion.id, level);
    await recordLedger(admin, {
      user_id: user.id,
      conversion_id: conversion.id,
      guide_version_id: version.id,
      repo_key: version.repo_key,
      level,
      phase: "open",
      outcome: "cache_hit",
      cache_eligible: true,
      quota_charged: charged,
    });
    return NextResponse.json({ ok: true, ...counts, quota_charged: charged });
  } catch (e) {
    if (charged) {
      const fresh = await getUserSubscription(admin, user.id);
      await admin
        .from("profiles")
        .update({ generation_count: Math.max(0, (fresh?.generation_count ?? 1) - 1) })
        .eq("id", user.id);
    }
    await admin.from("chapters").delete().eq("conversion_id", conversion.id).eq("level", level).eq("guide_version_id", version.id);
    await admin.from("flashcards").delete().eq("conversion_id", conversion.id).eq("level", level).eq("guide_version_id", version.id);
    await admin.from("quiz_questions").delete().eq("conversion_id", conversion.id).eq("level", level).eq("guide_version_id", version.id);
    console.error("guide open failed:", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "Could not open the cached guide. Please try again." }, { status: 500 });
  }
}
