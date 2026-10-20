/**
 * Repo identity (Saved-Guide Cache REQ v0.1, FR-1.1).
 * Accepts github.com / www.github.com URLs and "owner/name" shorthand,
 * strips .git, trailing slashes, query, fragment and sub-paths, and lowercases.
 */
export interface NormalizedRepo {
  owner: string;
  name: string;
  /** lowercased "owner/name" */
  repoKey: string;
}

const SEGMENT = /^[A-Za-z0-9_.-]+$/;

export function normalizeRepo(input: string): NormalizedRepo | null {
  if (typeof input !== "string") return null;
  const raw = input.trim();
  if (!raw) return null;

  let path: string;
  if (/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(raw)) {
    path = raw;
  } else {
    let url: URL;
    try {
      url = new URL(/^[a-z]+:\/\//i.test(raw) ? raw : `https://${raw}`);
    } catch {
      return null;
    }
    const host = url.hostname.toLowerCase();
    if (host !== "github.com" && host !== "www.github.com") return null;
    path = url.pathname;
  }

  const parts = path.split("/").filter(Boolean);
  if (parts.length < 2) return null;
  const owner = parts[0];
  const name = parts[1].replace(/\.git$/i, "");
  if (!SEGMENT.test(owner) || !SEGMENT.test(name) || name === "." || name === "..") return null;

  return { owner, name, repoKey: `${owner}/${name}`.toLowerCase() };
}
