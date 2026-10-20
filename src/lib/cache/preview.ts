import type { SupabaseClient } from "@supabase/supabase-js";
import { PAID_PLANS, UPGRADE_HEADLINE } from "@/lib/plans";

export interface GuidePreview {
  version: {
    id: string;
    repo_key: string;
    full_name: string;
    level: number;
    commit_sha: string;
    short_sha: string;
    ready_at: string | null;
  };
  chapter1: { title: string; content: string } | null;
  locked_chapters: { chapter_number: number; title: string }[];
  flashcard_count: number;
  quiz_count: number;
  plans: typeof PAID_PLANS;
  headline: string;
}

/**
 * FR-3.1 preview payload (Zach Q2: chapter 1 of every cached level).
 * Only ready, non-withdrawn versions. Never includes who generated it (privacy NFR).
 */
export async function getGuidePreview(admin: SupabaseClient, versionId: string): Promise<GuidePreview | null> {
  const { data: v } = await admin
    .from("guide_versions")
    .select("id, repo_key, github_repo_id, level, commit_sha, ready_at, status")
    .eq("id", versionId)
    .maybeSingle();
  if (!v || v.status !== "ready") return null;

  const [chapters, fc, qq, repo] = await Promise.all([
    admin.from("guide_chapters").select("chapter_number, title, content").eq("guide_version_id", v.id).order("chapter_number"),
    admin.from("guide_flashcards").select("id", { count: "exact", head: true }).eq("guide_version_id", v.id),
    admin.from("guide_quiz_questions").select("id", { count: "exact", head: true }).eq("guide_version_id", v.id),
    admin.from("repos").select("full_name").eq("github_repo_id", v.github_repo_id).maybeSingle(),
  ]);
  const rows = (chapters.data ?? []) as { chapter_number: number; title: string; content: string }[];
  const first = rows.find((c) => c.chapter_number === 1) ?? null;
  return {
    version: {
      id: v.id as string,
      repo_key: v.repo_key as string,
      full_name: (repo.data?.full_name as string | undefined) ?? (v.repo_key as string),
      level: v.level as number,
      commit_sha: v.commit_sha as string,
      short_sha: (v.commit_sha as string).slice(0, 7),
      ready_at: (v.ready_at as string | null) ?? null,
    },
    chapter1: first ? { title: first.title, content: first.content } : null,
    locked_chapters: rows.filter((c) => c.chapter_number > 1).map((c) => ({ chapter_number: c.chapter_number, title: c.title })),
    flashcard_count: fc.count ?? 0,
    quiz_count: qq.count ?? 0,
    plans: PAID_PLANS,
    headline: UPGRADE_HEADLINE,
  };
}
