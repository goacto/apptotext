import type { SupabaseClient } from "@supabase/supabase-js";
import { PROMPT_VERSION } from "@/lib/ai/prompts";

/** Saved-Guide Cache (PR 2). All functions take the service-role client. */

export const LEASE_SECONDS = 300;
export const MIN_READY = { chapters: 3, flashcards: 1, quiz: 1 };

export interface CacheEntry {
  version_id: string;
  sha: string;
  built_at: string;
  is_latest_sha: boolean;
}

export interface ConversionRepoFields {
  id: string;
  user_id: string;
  repo_key: string | null;
  github_repo_id: number | null;
  commit_sha: string | null;
  source_content?: string | null;
}

/** FR-5.2: repo public AND generator not private. (Do-not-cache arrives in PR 4.) */
export async function isCacheEligible(admin: SupabaseClient, conv: ConversionRepoFields, generatorId: string): Promise<boolean> {
  if (!conv.repo_key || !conv.commit_sha || !conv.github_repo_id) return false;
  const [{ data: repo }, { data: prof }] = await Promise.all([
    admin.from("repos").select("is_public").eq("github_repo_id", conv.github_repo_id).maybeSingle(),
    admin.from("profiles").select("guides_private").eq("id", generatorId).maybeSingle(),
  ]);
  return Boolean(repo?.is_public) && !prof?.guides_private;
}

/** Newest ready version per level for a repo; exact-SHA versions win (FR-2.1, FR-2.4). */
export function pickBestVersions(
  rows: { id: string; level: number; commit_sha: string; ready_at: string }[],
  currentSha: string | null
): Record<number, CacheEntry> {
  const out: Record<number, CacheEntry> = {};
  const sorted = [...rows].sort((a, b) => (a.ready_at < b.ready_at ? 1 : -1));
  for (const r of sorted) {
    const entry = { version_id: r.id, sha: r.commit_sha, built_at: r.ready_at, is_latest_sha: r.commit_sha === currentSha };
    const cur = out[r.level];
    if (!cur || (!cur.is_latest_sha && entry.is_latest_sha)) out[r.level] = entry;
  }
  return out;
}

export async function lookupCache(admin: SupabaseClient, repoKey: string, currentSha: string | null): Promise<Record<number, CacheEntry>> {
  const { data } = await admin
    .from("guide_versions")
    .select("id, level, commit_sha, ready_at")
    .eq("repo_key", repoKey)
    .eq("status", "ready")
    .order("ready_at", { ascending: false })
    .limit(100);
  return pickBestVersions((data ?? []) as { id: string; level: number; commit_sha: string; ready_at: string }[], currentSha);
}

export async function readyVersionForSha(admin: SupabaseClient, repoKey: string, sha: string, level: number) {
  const { data } = await admin
    .from("guide_versions")
    .select("id")
    .eq("repo_key", repoKey)
    .eq("commit_sha", sha)
    .eq("level", level)
    .eq("status", "ready")
    .order("ready_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data?.id as string | undefined) ?? null;
}

export interface ClaimResult {
  version_id: string;
  claimed: boolean;
  status: string;
}

export async function claimVersion(
  admin: SupabaseClient,
  conv: ConversionRepoFields,
  level: number,
  userId: string,
  provider: string,
  model: string,
  sourceHash: string | null
): Promise<ClaimResult> {
  const { data, error } = await admin.rpc("claim_guide_version", {
    p_github_repo_id: conv.github_repo_id,
    p_repo_key: conv.repo_key,
    p_commit_sha: conv.commit_sha,
    p_level: level,
    p_prompt_version: PROMPT_VERSION,
    p_user: userId,
    p_provider: provider,
    p_model: model,
    p_source_hash: sourceHash,
    p_lease_seconds: LEASE_SECONDS,
  });
  if (error) throw new Error(`claim failed: ${error.message}`);
  const row = (Array.isArray(data) ? data[0] : data) as ClaimResult;
  return row;
}

/** The generating version this user holds the lease on for a conversion+level (if any). */
export async function heldVersion(admin: SupabaseClient, conv: ConversionRepoFields, level: number, userId: string) {
  if (!conv.repo_key || !conv.commit_sha) return null;
  const { data } = await admin
    .from("guide_versions")
    .select("id")
    .eq("repo_key", conv.repo_key)
    .eq("commit_sha", conv.commit_sha)
    .eq("level", level)
    .eq("prompt_version", PROMPT_VERSION)
    .eq("status", "generating")
    .eq("lease_owner", userId)
    .maybeSingle();
  return (data?.id as string | undefined) ?? null;
}

export async function renewLease(admin: SupabaseClient, versionId: string) {
  await admin
    .from("guide_versions")
    .update({ lease_expires_at: new Date(Date.now() + LEASE_SECONDS * 1000).toISOString() })
    .eq("id", versionId)
    .eq("status", "generating");
}

export function wordCount(text: string): number {
  return (text.match(/\S+/g) ?? []).length;
}

export function isComplete(counts: { chapters: number; flashcards: number; quiz: number }): boolean {
  return counts.chapters >= MIN_READY.chapters && counts.flashcards >= MIN_READY.flashcards && counts.quiz >= MIN_READY.quiz;
}

/** FR-4.2: move to ready once content checks pass. Idempotent. */
export async function tryFinalize(admin: SupabaseClient, versionId: string): Promise<boolean> {
  const [ch, fc, qq] = await Promise.all([
    admin.from("guide_chapters").select("content, chapter_number").eq("guide_version_id", versionId),
    admin.from("guide_flashcards").select("id", { count: "exact", head: true }).eq("guide_version_id", versionId),
    admin.from("guide_quiz_questions").select("id", { count: "exact", head: true }).eq("guide_version_id", versionId),
  ]);
  const chapters = (ch.data ?? []) as { content: string }[];
  if (!isComplete({ chapters: chapters.length, flashcards: fc.count ?? 0, quiz: qq.count ?? 0 })) return false;
  const { data: costRows } = await admin
    .from("generations")
    .select("cost_usd")
    .eq("guide_version_id", versionId)
    .eq("outcome", "generated");
  const costs = (costRows ?? []).map((r) => r.cost_usd as number | null);
  const cost = costs.length && costs.every((c) => c != null) ? costs.reduce((a, b) => a + Number(b), 0) : null;
  const { data } = await admin
    .from("guide_versions")
    .update({
      status: "ready",
      ready_at: new Date().toISOString(),
      lease_owner: null,
      lease_expires_at: null,
      word_count: chapters.reduce((n, c) => n + wordCount(c.content), 0),
      cost_usd: cost,
    })
    .eq("id", versionId)
    .eq("status", "generating")
    .select("id");
  return Boolean(data?.length);
}

/** FR-4.4: a failed generation refunds the claimant's charge. */
export async function failVersion(admin: SupabaseClient, versionId: string, reason: string) {
  const { data } = await admin
    .from("guide_versions")
    .update({ status: "failed", lease_owner: null, lease_expires_at: null, withdrawn_reason: reason.slice(0, 200) })
    .eq("id", versionId)
    .eq("status", "generating")
    .select("quota_user")
    .maybeSingle();
  const quotaUser = data?.quota_user as string | null | undefined;
  if (quotaUser) {
    const { data: prof } = await admin.from("profiles").select("generation_count").eq("id", quotaUser).maybeSingle();
    const n = Math.max(0, ((prof?.generation_count as number | undefined) ?? 0) - 1);
    await admin.from("profiles").update({ generation_count: n }).eq("id", quotaUser);
    await admin.from("guide_versions").update({ quota_user: null }).eq("id", versionId);
    // The refunded charge no longer blocks a future charge for the same conversion/level.
    await admin.from("quota_charges").delete().eq("guide_version_id", versionId).eq("user_id", quotaUser);
  }
}

/** FR-2.2: copy a ready version into the user's own conversion rows (service role). */
export async function copyVersionToConversion(
  admin: SupabaseClient,
  versionId: string,
  conversionId: string,
  level: number
): Promise<{ chapters: number; flashcards: number; quiz: number }> {
  const [ch, fc, qq] = await Promise.all([
    admin.from("guide_chapters").select("chapter_number, title, content, key_concepts").eq("guide_version_id", versionId).order("chapter_number"),
    admin.from("guide_flashcards").select("front, back, difficulty").eq("guide_version_id", versionId),
    admin.from("guide_quiz_questions").select("question, options, correct_answer, explanation").eq("guide_version_id", versionId),
  ]);
  const base = { conversion_id: conversionId, level, guide_version_id: versionId };
  const chapters = (ch.data ?? []).map((r) => ({ ...base, ...r }));
  const flashcards = (fc.data ?? []).map((r) => ({ ...base, ...r }));
  const quiz = (qq.data ?? []).map((r) => ({ ...base, ...r }));
  if (chapters.length) {
    const { error } = await admin.from("chapters").insert(chapters);
    if (error) throw new Error(`copy chapters failed: ${error.message}`);
  }
  if (flashcards.length) {
    const { error } = await admin.from("flashcards").insert(flashcards);
    if (error) throw new Error(`copy flashcards failed: ${error.message}`);
  }
  if (quiz.length) {
    const { error } = await admin.from("quiz_questions").insert(quiz);
    if (error) throw new Error(`copy quiz failed: ${error.message}`);
  }
  return { chapters: chapters.length, flashcards: flashcards.length, quiz: quiz.length };
}
