import type { SupabaseClient } from "@supabase/supabase-js";
import { LIBRARY_PAGE_SIZE } from "./seo";

export interface LibraryRepo {
  github_repo_id: number;
  repo_key: string;
  full_name: string;
  language: string | null;
  stars: number;
  is_public: boolean;
}

const REPO_COLS = "github_repo_id, repo_key, full_name, language, stars, is_public";

/** Looks up by canonical key, then by alias (renamed repos 308 to the new key, FR-6.2). */
export async function findRepo(admin: SupabaseClient, key: string): Promise<LibraryRepo | null> {
  const k = key.toLowerCase();
  const { data } = await admin.from("repos").select(REPO_COLS).eq("repo_key", k).maybeSingle();
  if (data) return data as LibraryRepo;
  const { data: alias } = await admin.from("repo_aliases").select("github_repo_id").eq("repo_key", k).maybeSingle();
  if (!alias) return null;
  const { data: r } = await admin.from("repos").select(REPO_COLS).eq("github_repo_id", alias.github_repo_id).maybeSingle();
  return (r as LibraryRepo | null) ?? null;
}

export interface ListedVersion {
  id: string;
  github_repo_id: number;
  repo_key: string;
  level: number;
  commit_sha: string;
  ready_at: string;
  indexable: boolean;
}

const VERSION_COLS = "id, github_repo_id, repo_key, level, commit_sha, ready_at, indexable";

/** Newest listed+ready version per (repo, level). FR-6.7: nothing else is ever shown. */
export function latestPerLevel(rows: ListedVersion[]): ListedVersion[] {
  const seen = new Map<string, ListedVersion>();
  for (const r of [...rows].sort((a, b) => (a.ready_at < b.ready_at ? 1 : -1))) {
    const k = `${r.github_repo_id}:${r.level}`;
    if (!seen.has(k)) seen.set(k, r);
  }
  return [...seen.values()];
}

export async function listedVersionsForRepo(admin: SupabaseClient, githubRepoId: number): Promise<ListedVersion[]> {
  const { data } = await admin
    .from("guide_versions")
    .select(VERSION_COLS)
    .eq("github_repo_id", githubRepoId)
    .eq("status", "ready")
    .eq("listed", true);
  return latestPerLevel((data ?? []) as ListedVersion[]).sort((a, b) => a.level - b.level);
}

export async function allListed(admin: SupabaseClient): Promise<{ versions: ListedVersion[]; repos: Map<number, LibraryRepo> }> {
  const { data } = await admin
    .from("guide_versions")
    .select(VERSION_COLS)
    .eq("status", "ready")
    .eq("listed", true)
    .order("ready_at", { ascending: false })
    .limit(50_000);
  const versions = latestPerLevel((data ?? []) as ListedVersion[]);
  const ids = [...new Set(versions.map((v) => v.github_repo_id))];
  const repos = new Map<number, LibraryRepo>();
  for (let i = 0; i < ids.length; i += 500) {
    const { data: rs } = await admin.from("repos").select(REPO_COLS).in("github_repo_id", ids.slice(i, i + 500));
    for (const r of (rs ?? []) as LibraryRepo[]) repos.set(r.github_repo_id, r);
  }
  // Belt and braces: a repo that is not public is never shown, whatever the version flags say.
  return { versions: versions.filter((v) => repos.get(v.github_repo_id)?.is_public), repos };
}

export interface LibraryCard {
  repo: LibraryRepo;
  levels: number[];
  updated: string;
}

export function libraryCards(
  versions: ListedVersion[],
  repos: Map<number, LibraryRepo>,
  opts: { level?: number | null; lang?: string | null; page?: number }
): { cards: LibraryCard[]; total: number; pages: number; page: number } {
  const byRepo = new Map<number, LibraryCard>();
  for (const v of versions) {
    const repo = repos.get(v.github_repo_id);
    if (!repo) continue;
    const c = byRepo.get(v.github_repo_id) ?? { repo, levels: [], updated: v.ready_at };
    c.levels.push(v.level);
    if (v.ready_at > c.updated) c.updated = v.ready_at;
    byRepo.set(v.github_repo_id, c);
  }
  let cards = [...byRepo.values()];
  if (opts.level) cards = cards.filter((c) => c.levels.includes(opts.level!));
  if (opts.lang) cards = cards.filter((c) => (c.repo.language ?? "").toLowerCase() === opts.lang!.toLowerCase());
  cards.sort((a, b) => (a.updated < b.updated ? 1 : -1));
  for (const c of cards) c.levels.sort((a, b) => a - b);
  const total = cards.length;
  const pages = Math.max(1, Math.ceil(total / LIBRARY_PAGE_SIZE));
  const page = Math.min(Math.max(1, opts.page ?? 1), pages);
  return { cards: cards.slice((page - 1) * LIBRARY_PAGE_SIZE, page * LIBRARY_PAGE_SIZE), total, pages, page };
}
