import type { SupabaseClient } from "@supabase/supabase-js";
import {
  fetchHeadSha,
  fetchRepoMeta,
  getRateState,
  GitHubRateLimitError,
  isPubliclyVisible,
  serverToken,
  shaLookupMode,
  type RepoMeta,
} from "./api";
import { normalizeRepo } from "./normalize";
import { recordLedger } from "@/lib/ledger";

export const REPO_HEAD_TTL_SECONDS = Number(process.env.REPO_HEAD_TTL_SECONDS || 600);
export const STALE_HEAD_MAX_SECONDS = 24 * 3600;

export class RepoNotPublicError extends Error {
  constructor() {
    super("This repository is private or not publicly visible. AppToText can only convert public GitHub repositories.");
  }
}

export class RepoNotFoundError extends Error {
  constructor() {
    super("GitHub repository not found.");
  }
}

export interface ResolvedRepo {
  meta: RepoMeta;
  isPublic: boolean;
  inputKey: string;
}

/** FR-1.1, FR-1.2, FR-1.6. Upserts repos (+ alias for renamed repos). */
export async function resolveRepo(admin: SupabaseClient, url: string): Promise<ResolvedRepo> {
  const norm = normalizeRepo(url);
  if (!norm) throw new RepoNotFoundError();
  const meta = await fetchRepoMeta(norm.owner, norm.name, serverToken());
  if (!meta) throw new RepoNotFoundError();
  const isPublic = await isPubliclyVisible(meta);

  const { data: existing } = await admin
    .from("repos")
    .select("private_strikes")
    .eq("github_repo_id", meta.github_repo_id)
    .maybeSingle();

  await admin.from("repos").upsert(
    {
      github_repo_id: meta.github_repo_id,
      repo_key: meta.repo_key,
      full_name: meta.full_name,
      default_branch: meta.default_branch,
      is_public: isPublic,
      language: meta.language,
      stars: meta.stars,
      last_checked_at: new Date().toISOString(),
      private_strikes: isPublic ? 0 : ((existing?.private_strikes as number | undefined) ?? 0) + 1,
    },
    { onConflict: "github_repo_id" }
  );
  // FR-5.4(a): every lookup re-reads visibility. A definite "private" withdraws shared guides now.
  if (!isPublic) {
    await admin.rpc("withdraw_repo", { p_github_repo_id: meta.github_repo_id, p_reason: "repo_private" });
  }
  if (norm.repoKey !== meta.repo_key) {
    await admin
      .from("repo_aliases")
      .upsert({ repo_key: norm.repoKey, github_repo_id: meta.github_repo_id }, { onConflict: "repo_key" });
  }
  return { meta, isPublic, inputKey: norm.repoKey };
}

export interface HeadResult {
  sha: string;
  /** true when served from an expired cache entry because GitHub is rate-limited/down (hide Regenerate). */
  stale: boolean;
}

const inflight = new Map<number, Promise<HeadResult>>();

function ageSeconds(ts: string | null | undefined): number {
  if (!ts) return Infinity;
  return (Date.now() - new Date(ts).getTime()) / 1000;
}

/** FR-1.3 – FR-1.5. Shares concurrent lookups per instance. */
export function getHeadSha(admin: SupabaseClient, meta: RepoMeta, ctx: { userId?: string } = {}): Promise<HeadResult> {
  const key = meta.github_repo_id;
  const running = inflight.get(key);
  if (running) return running;
  const p = lookupHead(admin, meta, ctx).finally(() => inflight.delete(key));
  inflight.set(key, p);
  return p;
}

async function lookupHead(admin: SupabaseClient, meta: RepoMeta, ctx: { userId?: string }): Promise<HeadResult> {
  const { data: row } = await admin
    .from("repo_heads")
    .select("head_sha, etag, looked_up_at")
    .eq("github_repo_id", meta.github_repo_id)
    .maybeSingle();

  const age = ageSeconds(row?.looked_up_at as string | undefined);
  if (row && age < REPO_HEAD_TTL_SECONDS) return { sha: row.head_sha as string, stale: false };

  const mode = shaLookupMode(getRateState());
  const usableStale = row && age < STALE_HEAD_MAX_SECONDS;
  if (mode !== "fresh") {
    await recordLedger(admin, {
      user_id: ctx.userId,
      repo_key: meta.repo_key,
      phase: "github_rate_limit",
      outcome: "refused",
      detail: `mode=${mode} remaining=${getRateState().remaining}`,
    });
    if (usableStale) return { sha: row!.head_sha as string, stale: true };
    if (mode === "blocked") throw new GitHubRateLimitError();
  }

  try {
    const r = await fetchHeadSha(meta.owner, meta.name, meta.default_branch, (row?.etag as string | null) ?? null, serverToken());
    const sha = r.notModified ? (row!.head_sha as string) : r.sha!;
    await admin.from("repo_heads").upsert(
      { github_repo_id: meta.github_repo_id, head_sha: sha, etag: r.etag, looked_up_at: new Date().toISOString() },
      { onConflict: "github_repo_id" }
    );
    return { sha, stale: false };
  } catch (e) {
    if (usableStale) return { sha: row!.head_sha as string, stale: true };
    throw e;
  }
}
