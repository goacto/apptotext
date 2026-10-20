/**
 * Thin GitHub REST client with rate-limit tracking (FR-1.2, FR-1.3, FR-1.5, FR-1.6).
 * Never logs tokens.
 */
/** FR-1.5 thresholds are 500 / 100 of an authenticated 5000/h budget; scale them to the actual limit (unauthenticated = 60/h). */
export const LOW_RATE_FRACTION = 0.1;
export const CRITICAL_RATE_FRACTION = 0.02;

interface RateState {
  remaining: number | null;
  resetAt: number | null; // epoch ms
  limit?: number | null;
}

const rateState: RateState = { remaining: null, resetAt: null, limit: null };

export function rateThresholds(limit: number | null | undefined): { low: number; critical: number } {
  const l = limit && limit > 0 ? limit : 5000;
  return { low: Math.ceil(l * LOW_RATE_FRACTION), critical: Math.ceil(l * CRITICAL_RATE_FRACTION) };
}

export function getRateState(): RateState {
  return { ...rateState };
}

/** For tests. */
export function setRateState(next: Partial<RateState>) {
  Object.assign(rateState, next);
}

export type ShaLookupMode = "fresh" | "stale_ok" | "blocked";

/**
 * FR-1.5: below 500 remaining serve stale heads (hide Regenerate); below 100 or
 * after a 403/429, stop new SHA lookups until reset.
 */
export function shaLookupMode(state: RateState, now = Date.now()): ShaLookupMode {
  if (state.remaining == null) return "fresh";
  if (state.resetAt != null && now >= state.resetAt) return "fresh";
  const { low, critical } = rateThresholds(state.limit);
  if (state.remaining < critical) return "blocked";
  if (state.remaining < low) return "stale_ok";
  return "fresh";
}

function recordRate(res: Response) {
  const rem = res.headers.get("x-ratelimit-remaining");
  const reset = res.headers.get("x-ratelimit-reset");
  const limit = res.headers.get("x-ratelimit-limit");
  if (limit != null && limit !== "") rateState.limit = Number(limit);
  if (rem != null && rem !== "") rateState.remaining = Number(rem);
  if (reset != null && reset !== "") rateState.resetAt = Number(reset) * 1000;
  if ((res.status === 403 || res.status === 429) && rem === "0") {
    rateState.remaining = 0;
  }
}

export class GitHubRateLimitError extends Error {
  constructor() {
    super("GitHub rate limit reached. Please try again shortly.");
  }
}

function baseHeaders(token: string | undefined, accept = "application/vnd.github+json") {
  const h: Record<string, string> = { Accept: accept, "User-Agent": "AppToText" };
  if (token) h.Authorization = `Bearer ${token}`;
  return h;
}

export async function ghFetch(
  path: string,
  opts: { token?: string; accept?: string; etag?: string | null } = {}
): Promise<Response> {
  const headers = baseHeaders(opts.token, opts.accept);
  if (opts.etag) headers["If-None-Match"] = opts.etag;
  const res = await fetch(`https://api.github.com${path}`, { headers, cache: "no-store" });
  recordRate(res);
  if ((res.status === 403 || res.status === 429) && res.headers.get("x-ratelimit-remaining") === "0") {
    throw new GitHubRateLimitError();
  }
  return res;
}

export interface RepoMeta {
  github_repo_id: number;
  full_name: string;
  owner: string;
  name: string;
  repo_key: string;
  private: boolean;
  visibility: string;
  default_branch: string;
  archived: boolean;
  fork: boolean;
  parent_full_name: string | null;
  language: string | null;
  stars: number;
  description: string | null;
  forks: number;
}

export function repoMetaFromApi(d: Record<string, unknown>): RepoMeta {
  const full = String(d.full_name);
  const [owner, name] = full.split("/");
  const parent = d.parent as { full_name?: string } | undefined;
  return {
    github_repo_id: Number(d.id),
    full_name: full,
    owner,
    name,
    repo_key: full.toLowerCase(),
    private: Boolean(d.private),
    visibility: String(d.visibility ?? (d.private ? "private" : "public")),
    default_branch: String(d.default_branch ?? "main"),
    archived: Boolean(d.archived),
    fork: Boolean(d.fork),
    parent_full_name: parent?.full_name ?? null,
    language: (d.language as string | null) ?? null,
    stars: Number(d.stargazers_count ?? 0),
    description: (d.description as string | null) ?? null,
    forks: Number(d.forks_count ?? 0),
  };
}

/** Server token (may reach private repos) — only used for metadata. */
export function serverToken(): string | undefined {
  return process.env.GITHUB_TOKEN || undefined;
}

/** Public-only token (FR-1.6). Falls back to unauthenticated, which can only see public repos. */
export function publicToken(): string | undefined {
  return process.env.GITHUB_PUBLIC_TOKEN || undefined;
}

/** GET /repos/{o}/{r}; follows renames (fetch follows the 301). Returns null on 404. */
export async function fetchRepoMeta(owner: string, name: string, token?: string): Promise<RepoMeta | null> {
  const res = await ghFetch(`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}`, { token });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`GitHub repo lookup failed (${res.status})`);
  return repoMetaFromApi(await res.json());
}

/**
 * FR-1.6: a repo is public only if the API says private=false AND visibility=public,
 * AND the same check succeeds through a token with no private-repo access.
 */
export async function isPubliclyVisible(meta: RepoMeta): Promise<boolean> {
  if (meta.private || meta.visibility !== "public") return false;
  const pub = publicToken();
  // Unauthenticated (no server token) already is a public-only check.
  if (!serverToken() && !pub) return true;
  try {
    const again = await fetchRepoMeta(meta.owner, meta.name, pub);
    return Boolean(again && !again.private && again.visibility === "public" && again.github_repo_id === meta.github_repo_id);
  } catch (e) {
    if (e instanceof GitHubRateLimitError) throw e;
    return false;
  }
}

/** FR-1.3: HEAD sha via Accept: application/vnd.github.sha with ETag. */
export async function fetchHeadSha(
  owner: string,
  name: string,
  branch: string,
  etag: string | null,
  token?: string
): Promise<{ sha: string | null; etag: string | null; notModified: boolean }> {
  const res = await ghFetch(
    `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}/commits/${encodeURIComponent(branch)}`,
    { token, accept: "application/vnd.github.sha", etag }
  );
  if (res.status === 304) return { sha: null, etag, notModified: true };
  if (!res.ok) throw new Error(`GitHub HEAD lookup failed (${res.status})`);
  const sha = (await res.text()).trim();
  if (!/^[0-9a-f]{40}$/.test(sha)) throw new Error("Unexpected SHA response from GitHub");
  return { sha, etag: res.headers.get("etag"), notModified: false };
}
