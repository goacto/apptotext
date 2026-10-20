import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { fetchRepoMeta, publicToken } from "@/lib/github/api";
import {
  REPO_PROOF_DAYS,
  appendEvent,
  checkOwnership,
  githubBudgetOk,
  recheckRepoVisibility,
  takedown,
  type RemovalType,
} from "@/lib/cache/removal";

export const maxDuration = 60;
const MIN_GAP_MS = 20 * 3600 * 1000;
const REPOS_PER_RUN = 20;
const REQUESTS_PER_RUN = 20;

/**
 * Daily job (Vercel Hobby cron, 08:00 UTC = 04:00 ET in summer). Runs:
 *  1. purge of any withdrawn version still holding content (FR-5.5 safety net),
 *  2. visibility re-check of repos with live versions (FR-5.4), within the GitHub budget,
 *  3. repo-proof checks for pending removal requests up to 7 days old (FR-7.2b).
 * Auth: Bearer CRON_SECRET when that env var is set. Without it, the job is still harmless to
 * trigger: it is idempotent and runs at most once per 20 hours (cron_runs).
 */
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret && request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const admin = createAdminClient();
  const now = Date.now();

  const { data: last } = await admin.from("cron_runs").select("last_started_at").eq("job", "daily").maybeSingle();
  if (last?.last_started_at && now - new Date(last.last_started_at as string).getTime() < MIN_GAP_MS) {
    return NextResponse.json({ skipped: true, reason: "ran recently" });
  }
  await admin.from("cron_runs").upsert({ job: "daily", last_started_at: new Date(now).toISOString() }, { onConflict: "job" });

  const result: Record<string, unknown> = {};

  // 1. Purge
  const { data: purged } = await admin.rpc("purge_withdrawn_versions");
  result.purged = Number(purged ?? 0);
  const { data: pruned } = await admin.rpc("prune_rate_limits");
  result.rate_limit_rows_pruned = Number(pruned ?? 0);

  // 2. Visibility re-check: repos with a ready or generating version, least recently checked first.
  const { data: live } = await admin
    .from("guide_versions")
    .select("github_repo_id")
    .in("status", ["ready", "generating"])
    .limit(1000);
  const ids = [...new Set((live ?? []).map((r) => r.github_repo_id as number))];
  const visibility: Record<string, number> = { public: 0, strike: 0, withdrawn: 0, skipped: 0, budget_stop: 0, error: 0 };
  if (ids.length) {
    const { data: repos } = await admin
      .from("repos")
      .select("github_repo_id, full_name, first_strike_at, last_checked_at")
      .in("github_repo_id", ids)
      .order("last_checked_at", { ascending: true })
      .limit(REPOS_PER_RUN);
    for (const r of repos ?? []) {
      if (!githubBudgetOk()) {
        visibility.budget_stop++;
        break;
      }
      try {
        const out = await recheckRepoVisibility(admin, {
          github_repo_id: r.github_repo_id as number,
          full_name: r.full_name as string,
          first_strike_at: (r.first_strike_at as string | null) ?? null,
        });
        visibility[out]++;
      } catch {
        visibility.error++;
      }
    }
  }
  result.visibility = visibility;

  // 3. Repo-proof checks for pending removal requests.
  const since = new Date(now - REPO_PROOF_DAYS * 24 * 3600 * 1000).toISOString();
  const { data: pending } = await admin
    .from("removal_requests")
    .select("id, repo_key, github_repo_id, type, email, verify_token")
    .eq("status", "pending")
    .in("type", ["remove", "remove_never"])
    .gte("created_at", since)
    .order("created_at", { ascending: true })
    .limit(REQUESTS_PER_RUN);
  let verified = 0;
  for (const req of pending ?? []) {
    if (!githubBudgetOk()) break;
    const [owner, name] = String(req.repo_key).split("/");
    const meta = await fetchRepoMeta(owner, name, publicToken()).catch(() => null);
    if (!meta) continue;
    const method = await checkOwnership(meta, req.verify_token as string, null);
    if (!method) continue;
    await takedown(
      admin,
      { id: req.id as string, repo_key: meta.repo_key, github_repo_id: meta.github_repo_id, type: req.type as RemovalType, email: req.email as string },
      method,
      meta.owner
    );
    await appendEvent(admin, req.id as string, "verified_by_daily_job");
    verified++;
  }
  result.requests_checked = pending?.length ?? 0;
  result.requests_verified = verified;

  await admin
    .from("cron_runs")
    .update({ last_finished_at: new Date().toISOString(), last_result: result })
    .eq("job", "daily");
  return NextResponse.json(result);
}
