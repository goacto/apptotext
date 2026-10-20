import type { Metadata } from "next";
import Link from "next/link";
import { notFound, permanentRedirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { findRepo, listedVersionsForRepo } from "@/lib/library/data";
import { canonicalRedirect, levelName, levelPath, repoPath } from "@/lib/library/seo";
import { LibraryFooter } from "@/components/library/library-footer";

export const revalidate = 3600;
export const dynamicParams = true;
export function generateStaticParams() {
  return [];
}

type Params = { owner: string; repo: string };

async function load(p: Params) {
  const admin = createAdminClient();
  const repo = await findRepo(admin, `${decodeURIComponent(p.owner)}/${decodeURIComponent(p.repo)}`);
  if (!repo || !repo.is_public) return null;
  const versions = await listedVersionsForRepo(admin, repo.github_repo_id);
  if (!versions.length) return null;
  return { repo, versions };
}

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const data = await load(await params);
  if (!data) return { robots: { index: false, follow: false } };
  const { repo, versions } = data;
  const title = `${repo.full_name} guides | AppToText`;
  return {
    title: { absolute: title.length <= 60 ? title : `${repo.full_name} guides` },
    description: `Learn ${repo.full_name} with AppToText guides at ${versions.map((v) => v.level).join(", ")}. Chapter 1 of each level is free.`,
    alternates: { canonical: repoPath(repo.repo_key) },
    // FR-6.6: a repo page is indexable only if at least one of its levels is.
    robots: versions.some((v) => v.indexable) ? { index: true, follow: true } : { index: false, follow: true },
    openGraph: { url: repoPath(repo.repo_key), title, type: "website" },
  };
}

export default async function RepoPage({ params }: { params: Promise<Params> }) {
  const p = await params;
  const data = await load(p);
  if (!data) notFound();
  const { repo, versions } = data;
  const to = canonicalRedirect(p.owner, p.repo, null, repo.repo_key);
  if (to) permanentRedirect(to);
  const latest = versions.reduce((a, b) => (a.ready_at > b.ready_at ? a : b));

  return (
    <main className="mx-auto max-w-3xl px-4 py-10">
      <nav className="text-sm text-muted-foreground">
        <Link href="/library" className="hover:underline">Library</Link> / {repo.full_name}
      </nav>
      <h1 className="mt-2 text-3xl font-bold">{repo.full_name}</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        {repo.language ?? "Unknown language"} · ★ {repo.stars.toLocaleString("en-US")} ·{" "}
        <a href={`https://github.com/${repo.full_name}`} className="underline" rel="nofollow noopener" target="_blank">
          View on GitHub
        </a>
      </p>
      <h2 className="mt-8 text-xl font-semibold">Available levels</h2>
      <ul className="mt-3 space-y-2">
        {versions.map((v) => (
          <li key={v.id}>
            <Link href={levelPath(repo.repo_key, v.level)} className="font-medium hover:underline">
              {v.level} {levelName(v.level)}
            </Link>{" "}
            <span className="text-xs text-muted-foreground">built from commit {v.commit_sha.slice(0, 7)}</span>
          </li>
        ))}
      </ul>
      <p className="mt-6 text-xs text-muted-foreground">Last updated {new Date(latest.ready_at).toISOString().slice(0, 10)}.</p>
      <LibraryFooter repoKey={repo.repo_key} />
    </main>
  );
}
