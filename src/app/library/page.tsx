import type { Metadata } from "next";
import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/admin";
import { allListed, libraryCards } from "@/lib/library/data";
import { levelName, levelPath, parseLevelSlug, repoPath } from "@/lib/library/seo";
import { TEXTBOOK_LEVELS } from "@/lib/constants";
import { LibraryFooter } from "@/components/library/library-footer";

type SP = { page?: string; level?: string; lang?: string };

export async function generateMetadata({ searchParams }: { searchParams: Promise<SP> }): Promise<Metadata> {
  const sp = await searchParams;
  const filtered = Boolean(sp.level || sp.lang || (Number(sp.page) || 1) > 1);
  return {
    title: { absolute: "Library: learn open-source code, level by level | AppToText" },
    description:
      "Free chapter-one previews of AppToText guides built from public GitHub repositories, from beginner (101) to principal (501).",
    alternates: { canonical: "/library" },
    // Filtered and paged views point at /library and stay out of the index.
    ...(filtered ? { robots: { index: false, follow: true } } : {}),
  };
}

export default async function LibraryIndex({
  searchParams,
}: {
  searchParams: Promise<SP>;
}) {
  const sp = await searchParams;
  const level = sp.level ? parseLevelSlug(sp.level) : null;
  const lang = sp.lang ? sp.lang.slice(0, 40) : null;
  const { versions, repos } = await allListed(createAdminClient());
  const { cards, total, pages, page } = libraryCards(versions, repos, { level, lang, page: Number(sp.page) || 1 });
  const languages = [...new Set([...repos.values()].map((r) => r.language).filter(Boolean))].sort() as string[];
  const q = (o: Record<string, string | number | null>) => {
    const p = new URLSearchParams();
    const merged = { level, lang, page: null, ...o };
    for (const [k, v] of Object.entries(merged)) if (v != null && v !== "") p.set(k, String(v));
    const s = p.toString();
    return s ? `/library?${s}` : "/library";
  };

  return (
    <main className="mx-auto max-w-5xl px-4 py-10">
      <h1 className="text-3xl font-bold">Library</h1>
      <p className="mt-2 text-muted-foreground">
        Guides built from public GitHub repositories. Chapter 1 of every level is free to read.{" "}
        <Link href="/pricing" className="font-medium text-primary underline-offset-4 hover:underline">
          See pricing
        </Link>{" "}
        to unlock full guides, flashcards and quizzes.
      </p>

      <div className="mt-6 flex flex-wrap gap-2 text-sm">
        <Link href={q({ level: null })} className={!level ? "font-semibold underline" : ""}>All levels</Link>
        {TEXTBOOK_LEVELS.map((l) => (
          <Link key={l.level} href={q({ level: l.level })} className={level === l.level ? "font-semibold underline" : ""}>
            {l.level} {l.name}
          </Link>
        ))}
      </div>
      {languages.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-2 text-sm">
          <Link href={q({ lang: null })} className={!lang ? "font-semibold underline" : ""}>All languages</Link>
          {languages.map((l) => (
            <Link key={l} href={q({ lang: l })} className={lang?.toLowerCase() === l.toLowerCase() ? "font-semibold underline" : ""}>
              {l}
            </Link>
          ))}
        </div>
      )}

      {total === 0 ? (
        <p className="mt-10 text-muted-foreground">No guides here yet.</p>
      ) : (
        <ul className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {cards.map((c) => (
            <li key={c.repo.github_repo_id} className="rounded-lg border p-4">
              <Link href={repoPath(c.repo.repo_key)} className="font-semibold hover:underline">
                {c.repo.full_name}
              </Link>
              <div className="mt-1 text-xs text-muted-foreground">
                {c.repo.language ?? "Unknown language"} · ★ {c.repo.stars.toLocaleString("en-US")}
              </div>
              <div className="mt-3 flex flex-wrap gap-2 text-xs">
                {c.levels.map((l) => (
                  <Link key={l} href={levelPath(c.repo.repo_key, l)} className="rounded border px-2 py-0.5 hover:bg-muted">
                    {l} {levelName(l)}
                  </Link>
                ))}
              </div>
            </li>
          ))}
        </ul>
      )}

      {pages > 1 && (
        <nav className="mt-8 flex gap-4 text-sm">
          {page > 1 && <Link href={q({ page: page - 1 })}>← Previous</Link>}
          <span>Page {page} of {pages}</span>
          {page < pages && <Link href={q({ page: page + 1 })}>Next →</Link>}
        </nav>
      )}
      <LibraryFooter />
    </main>
  );
}
