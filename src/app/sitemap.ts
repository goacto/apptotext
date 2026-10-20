import type { MetadataRoute } from "next";
import { createAdminClient } from "@/lib/supabase/admin";
import { allListed } from "@/lib/library/data";
import { levelPath, repoPath, SITE_URL } from "@/lib/library/seo";

export const revalidate = 3600;

/**
 * FR-6.5: /library, indexable repo pages and indexable level pages, lastmod = ready_at.
 * One file while under 45,000 URLs (switch to generateSitemaps past that).
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const out: MetadataRoute.Sitemap = [
    { url: SITE_URL, changeFrequency: "weekly", priority: 1 },
    { url: `${SITE_URL}/library`, changeFrequency: "daily", priority: 0.8 },
  ];
  try {
    const { versions, repos } = await allListed(createAdminClient());
    const repoLastmod = new Map<number, string>();
    for (const v of versions) {
      if (!v.indexable) continue;
      const repo = repos.get(v.github_repo_id);
      if (!repo) continue;
      out.push({ url: `${SITE_URL}${levelPath(repo.repo_key, v.level)}`, lastModified: v.ready_at });
      const cur = repoLastmod.get(v.github_repo_id);
      if (!cur || v.ready_at > cur) repoLastmod.set(v.github_repo_id, v.ready_at);
    }
    for (const [id, lastmod] of repoLastmod) {
      out.push({ url: `${SITE_URL}${repoPath(repos.get(id)!.repo_key)}`, lastModified: lastmod });
    }
  } catch {
    /* DB unavailable: still serve the static entries */
  }
  return out.slice(0, 45_000);
}
