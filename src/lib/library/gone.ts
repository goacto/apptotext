/** FR-5.5 / FR-6.x: library paths that may need a 410. Pure, used by the proxy. */
export function libraryRepoFromPath(pathname: string): { repoKey: string; level: number | null } | null {
  const m = /^\/library\/([^/]+)\/([^/]+)(?:\/(\d{3})(?:-[^/]*)?)?\/?$/.exec(pathname);
  if (!m) return null;
  if (m[1].toLowerCase() === "remove") return null;
  let owner: string, repo: string;
  try {
    owner = decodeURIComponent(m[1]);
    repo = decodeURIComponent(m[2]);
  } catch {
    return null;
  }
  return { repoKey: `${owner}/${repo}`.toLowerCase(), level: m[3] ? Number(m[3]) : null };
}

export const GONE_HTML =
  '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="robots" content="noindex"><title>Guide removed | AppToText</title></head>' +
  '<body style="font-family:system-ui;max-width:40rem;margin:4rem auto;padding:0 1rem"><h1>This guide is no longer available</h1>' +
  '<p>It was removed from the AppToText library.</p><p><a href="/library">Browse the library</a></p></body></html>';

/** Calls the public library_gone() RPC with the anon key. Fails open (returns false) on any error. */
export async function isLibraryGone(repoKey: string, level: number | null, timeoutMs = 1500): Promise<boolean> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return false;
  try {
    const res = await fetch(`${url}/rest/v1/rpc/library_gone`, {
      method: "POST",
      headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ p_repo_key: repoKey, p_level: level }),
      signal: AbortSignal.timeout(timeoutMs),
      cache: "no-store",
    });
    if (!res.ok) return false;
    return (await res.json()) === true;
  } catch {
    return false;
  }
}
