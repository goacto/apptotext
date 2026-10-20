import type { SupabaseClient } from "@supabase/supabase-js";
import { isCacheEligible } from "@/lib/cache/guides";
import { levelPath, repoPath, thinContentReasons } from "./seo";

/**
 * FR-6.6 / FR-6.7: decide listed + indexable for one version. A version is listed only when it is
 * ready and still cache-eligible (public repo, not do-not-cache, generator not guides_private).
 * It is indexable only when listed and it passes the thin-content rule. Never throws.
 */
export async function computeListing(
  admin: SupabaseClient,
  versionId: string
): Promise<{ listed: boolean; indexable: boolean; reasons: string[] } | null> {
  try {
    const { data: v } = await admin
      .from("guide_versions")
      .select("id, status, repo_key, commit_sha, github_repo_id, generated_by, level")
      .eq("id", versionId)
      .maybeSingle();
    if (!v) return null;
    const [eligible, { data: chapters }, { data: repo }] = await Promise.all([
      isCacheEligible(
        admin,
        {
          id: "",
          user_id: "",
          repo_key: v.repo_key as string,
          github_repo_id: v.github_repo_id as number,
          commit_sha: v.commit_sha as string,
        },
        (v.generated_by as string | null) ?? "00000000-0000-0000-0000-000000000000"
      ),
      admin.from("guide_chapters").select("chapter_number, content").eq("guide_version_id", v.id),
      admin.from("repos").select("has_readme").eq("github_repo_id", v.github_repo_id).maybeSingle(),
    ]);
    const listed = v.status === "ready" && eligible;
    const reasons = thinContentReasons({
      status: v.status as string,
      chapters: (chapters ?? []) as { chapter_number: number; content: string }[],
      hasReadme: (repo?.has_readme as boolean | null | undefined) ?? null,
    });
    const indexable = listed && reasons.length === 0;
    await admin.from("guide_versions").update({ listed, indexable }).eq("id", v.id).eq("status", "ready");
    await revalidateLibrary(v.repo_key as string, v.level as number);
    return { listed, indexable, reasons };
  } catch {
    return null;
  }
}

/** After a repo passes a public re-check again, recompute every ready version (FR-5.4 strike undo). */
export async function relistRepo(admin: SupabaseClient, githubRepoId: number): Promise<number> {
  const { data } = await admin
    .from("guide_versions")
    .select("id")
    .eq("github_repo_id", githubRepoId)
    .eq("status", "ready");
  for (const r of data ?? []) await computeListing(admin, r.id as string);
  return data?.length ?? 0;
}

/** On-demand ISR (FR-6.1). Outside a request context this is a no-op. */
export async function revalidateLibrary(repoKey: string, level?: number) {
  try {
    const { revalidatePath } = await import("next/cache");
    revalidatePath("/library");
    revalidatePath(repoPath(repoKey));
    if (level) revalidatePath(levelPath(repoKey, level));
    revalidatePath("/sitemap.xml");
  } catch {
    /* not in a Next request (tests, scripts) */
  }
}
