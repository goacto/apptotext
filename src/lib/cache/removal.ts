import { createHmac, randomBytes } from "node:crypto";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { fetchRepoMeta, publicToken, shaLookupMode, getRateState, type RepoMeta } from "@/lib/github/api";
import { sendEmail } from "@/lib/email";
import { removalDoneEmail } from "@/lib/email/templates";
import { relistRepo } from "@/lib/library/listing";

/** PR 4: removal requests, do-not-cache, withdrawal and visibility checks. Service-role client only. */

export const REMOVAL_TYPES = ["remove", "remove_never", "report"] as const;
export type RemovalType = (typeof REMOVAL_TYPES)[number];
export const REMOVAL_IP_LIMIT_PER_DAY = 5;
export const REPO_PROOF_DAYS = 7;
export const STRIKE_GAP_MS = 60 * 60 * 1000;
export const OPTOUT_TOPIC = "apptotext-optout";
export const OPTOUT_FILE = ".apptotext-optout";

export function newVerifyToken(): string {
  return `a2t-${randomBytes(12).toString("hex")}`;
}

/** Keyed hash so stored IPs can't be brute-forced back from the table. */
export function hashIp(ip: string, key = process.env.IP_HASH_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || "a2t"): string {
  return createHmac("sha256", key).update(ip).digest("hex").slice(0, 32);
}

export function isValidEmail(s: unknown): s is string {
  return typeof s === "string" && s.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
}

export async function isDoNotCache(admin: SupabaseClient, githubRepoId: number | null, repoKey: string): Promise<boolean> {
  const { data, error } = await admin.rpc("is_do_not_cache", { p_github_repo_id: githubRepoId, p_repo_key: repoKey });
  if (error) return true; // fail closed: never cache when unsure
  return data === true;
}

export async function appendEvent(admin: SupabaseClient, requestId: string, event: string, detail: Record<string, unknown> = {}) {
  const { data } = await admin.from("removal_requests").select("events").eq("id", requestId).maybeSingle();
  const events = Array.isArray(data?.events) ? (data!.events as unknown[]) : [];
  events.push({ at: new Date().toISOString(), event, ...detail });
  await admin.from("removal_requests").update({ events }).eq("id", requestId);
}

/** GitHub login of a Supabase user who signed in with GitHub (FR-7.2a). */
export function githubLogin(user: Pick<User, "identities"> | null | undefined): string | null {
  const id = user?.identities?.find((i) => i.provider === "github");
  const d = (id?.identity_data ?? {}) as Record<string, unknown>;
  const login = (d.user_name ?? d.preferred_username) as string | undefined;
  return login ? String(login) : null;
}

export type VerifyMethod = "github_signin" | "repo_topic" | "repo_file";

/**
 * FR-7.2 (a) and (b). (a): signed in with GitHub as the owner of a user-owned repo.
 * Org repos (or collaborator access) need (b) or manual review (c): we don't keep users' GitHub tokens.
 */
export async function checkOwnership(
  meta: RepoMeta,
  token: string,
  user: Pick<User, "identities"> | null,
  fetchImpl: typeof fetch = fetch
): Promise<VerifyMethod | null> {
  const login = githubLogin(user);
  if (login && login.toLowerCase() === meta.owner.toLowerCase()) return "github_signin";
  if (meta.topics.map((t) => t.toLowerCase()).includes(OPTOUT_TOPIC)) return "repo_topic";
  try {
    const res = await fetchImpl(
      `https://raw.githubusercontent.com/${meta.full_name}/${encodeURIComponent(meta.default_branch)}/${OPTOUT_FILE}`,
      { cache: "no-store" }
    );
    if (res.ok && (await res.text()).includes(token)) return "repo_file";
  } catch {
    // network blip: not verified this time
  }
  return null;
}

/** FR-7.4: verified -> withdraw (+ purge) -> optional do-not-cache -> confirmation -> closed. */
export async function takedown(
  admin: SupabaseClient,
  req: { id: string; repo_key: string; github_repo_id: number | null; type: RemovalType; email: string },
  method: VerifyMethod | "manual",
  owner: string | null
): Promise<{ withdrawn: number; emailed: boolean }> {
  await admin.from("removal_requests").update({ status: "verified", verify_method: method }).eq("id", req.id);
  await appendEvent(admin, req.id, "verified", { method });
  let withdrawn = 0;
  if (req.github_repo_id) {
    const { data } = await admin.rpc("withdraw_repo", { p_github_repo_id: req.github_repo_id, p_reason: "owner_request" });
    withdrawn = Number(data ?? 0);
  }
  await appendEvent(admin, req.id, "withdrawn", { versions: withdrawn });
  if (req.type === "remove_never") {
    // Plain insert: a duplicate (already on the list) is fine and ignored.
    await admin.from("do_not_cache").insert({
      github_repo_id: req.github_repo_id,
      repo_key: req.repo_key.toLowerCase(),
      owner,
      owner_wildcard: false,
      reason: "owner_request",
      request_id: req.id,
    });
    await appendEvent(admin, req.id, "do_not_cache_added");
  }
  const mail = removalDoneEmail(req.repo_key, req.type === "remove_never");
  const sent = await sendEmail({ to: req.email, ...mail });
  await appendEvent(admin, req.id, "confirmation_email", { provider: sent.provider, delivered: sent.delivered });
  await admin.from("removal_requests").update({ status: "closed", resolved_at: new Date().toISOString() }).eq("id", req.id);
  await appendEvent(admin, req.id, "closed");
  return { withdrawn, emailed: sent.delivered };
}

/**
 * FR-5.4: daily visibility re-check. private:true withdraws now; a 404 counts as private only on
 * a second check at least 1 hour after the first (the first strike already unlists, as a precaution).
 */
export async function recheckRepoVisibility(
  admin: SupabaseClient,
  repo: { github_repo_id: number; full_name: string; first_strike_at: string | null },
  now = Date.now(),
  fetchMeta: typeof fetchRepoMeta = fetchRepoMeta
): Promise<"public" | "strike" | "withdrawn" | "skipped"> {
  const [owner, name] = repo.full_name.split("/");
  const meta = await fetchMeta(owner, name, publicToken());
  const stamp = new Date(now).toISOString();
  if (meta && !meta.private && meta.visibility === "public" && meta.github_repo_id === repo.github_repo_id) {
    await admin
      .from("repos")
      .update({ is_public: true, private_strikes: 0, first_strike_at: null, last_checked_at: stamp })
      .eq("github_repo_id", repo.github_repo_id);
    // A first strike unlisted everything as a precaution; a public result lists it again.
    if (repo.first_strike_at) await relistRepo(admin, repo.github_repo_id);
    return "public";
  }
  const definitelyPrivate = Boolean(meta && (meta.private || meta.visibility !== "public"));
  const firstAt = repo.first_strike_at ? new Date(repo.first_strike_at).getTime() : null;
  if (definitelyPrivate || (firstAt !== null && now - firstAt >= STRIKE_GAP_MS)) {
    await admin
      .from("repos")
      .update({ is_public: false, private_strikes: 2, last_checked_at: stamp })
      .eq("github_repo_id", repo.github_repo_id);
    await admin.rpc("withdraw_repo", { p_github_repo_id: repo.github_repo_id, p_reason: "repo_private" });
    return "withdrawn";
  }
  if (firstAt === null) {
    await admin
      .from("repos")
      .update({ private_strikes: 1, first_strike_at: stamp, last_checked_at: stamp })
      .eq("github_repo_id", repo.github_repo_id);
    await admin.from("guide_versions").update({ listed: false, indexable: false }).eq("github_repo_id", repo.github_repo_id);
    return "strike";
  }
  return "skipped"; // second 404 within the hour: wait for the next check
}

/** GitHub budget guard for background work (FR-1.5): only run when lookups are "fresh". */
export function githubBudgetOk(): boolean {
  return shaLookupMode(getRateState()) === "fresh";
}
