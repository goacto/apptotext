import type { Metadata } from "next";
import Link from "next/link";
import { notFound, permanentRedirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { findRepo, listedVersionsForRepo } from "@/lib/library/data";
import { getGuidePreview } from "@/lib/cache/preview";
import {
  canonicalRedirect,
  descriptionFrom,
  jsonLdScript,
  levelJsonLd,
  levelName,
  levelPath,
  levelTitle,
  parseLevelSlug,
  repoPath,
} from "@/lib/library/seo";
import { LibraryPreview } from "@/components/library/library-preview";
import { LibraryFooter } from "@/components/library/library-footer";

export const revalidate = 3600;
export const dynamicParams = true;
export function generateStaticParams() {
  return [];
}

type Params = { owner: string; repo: string; level: string };

async function load(p: Params) {
  const level = parseLevelSlug(decodeURIComponent(p.level));
  if (level === null) return null;
  const admin = createAdminClient();
  const repo = await findRepo(admin, `${decodeURIComponent(p.owner)}/${decodeURIComponent(p.repo)}`);
  if (!repo || !repo.is_public) return null;
  const version = (await listedVersionsForRepo(admin, repo.github_repo_id)).find((v) => v.level === level);
  if (!version) return null;
  const preview = await getGuidePreview(admin, version.id);
  if (!preview?.chapter1) return null;
  return { repo, level, version, preview };
}

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const data = await load(await params);
  if (!data) return { robots: { index: false, follow: false } };
  const { repo, level, version, preview } = data;
  const url = levelPath(repo.repo_key, level);
  const title = levelTitle(repo.full_name, level);
  const description = descriptionFrom(preview.chapter1!.content);
  return {
    title: { absolute: title },
    description,
    alternates: { canonical: url },
    robots: version.indexable ? { index: true, follow: true } : { index: false, follow: true },
    openGraph: { type: "article", url, title, description, modifiedTime: version.ready_at },
    twitter: { card: "summary", title, description },
  };
}

export default async function LevelPage({ params }: { params: Promise<Params> }) {
  const p = await params;
  const data = await load(p);
  if (!data) notFound();
  const { repo, level, version, preview } = data;
  const to = canonicalRedirect(p.owner, p.repo, p.level, repo.repo_key);
  if (to) permanentRedirect(to);
  const url = levelPath(repo.repo_key, level);
  const ld = levelJsonLd({
    fullName: repo.full_name,
    repoKey: repo.repo_key,
    level,
    description: descriptionFrom(preview.chapter1!.content),
    readyAt: version.ready_at,
  });

  return (
    <main className="mx-auto max-w-3xl px-4 py-10">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdScript(ld) }} />
      <nav className="text-sm text-muted-foreground">
        <Link href="/library" className="hover:underline">Library</Link> /{" "}
        <Link href={repoPath(repo.repo_key)} className="hover:underline">{repo.full_name}</Link> / {level}
      </nav>
      <h1 className="mt-2 text-3xl font-bold">
        {repo.full_name}: {levelName(level)} guide ({level})
      </h1>
      <p className="mt-2 text-xs text-muted-foreground">
        Built from commit {version.commit_sha.slice(0, 7)} on {version.ready_at.slice(0, 10)}.
      </p>
      <div className="mt-6">
        <LibraryPreview preview={preview} returnTo={url} />
      </div>
      <p className="mt-8 text-sm">
        Want all chapters, flashcards and the quiz in your workspace?{" "}
        <Link href="/dashboard" className="underline">
          Convert {repo.full_name} from your dashboard
        </Link>{" "}
        and open level {level}.
      </p>
      <LibraryFooter repoKey={repo.repo_key} />
    </main>
  );
}
