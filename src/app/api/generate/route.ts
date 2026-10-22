import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { AIProvider, TextbookLevel } from "@/lib/types";
import { callAI, PROVIDER_MODELS, streamAI } from "@/lib/ai/provider";
import { extractKeyConcepts } from "@/lib/ai/key-concepts";
import type { TokenUsage } from "@/lib/ai/pricing";
import { estimateTokens, finishLedger, progressLedger, recordLedger, startLedger } from "@/lib/ledger";
import { sha256 } from "@/lib/github/source";
import { computeListing } from "@/lib/library/listing";
import {
  claimVersion,
  failVersion,
  heldVersion,
  isCacheEligible,
  readyVersionForSha,
  renewLease,
  tryFinalize,
  type ConversionRepoFields,
} from "@/lib/cache/guides";
import {
  getTextbookSystemPrompt,
  getTextbookUserPrompt,
  getFlashcardSystemPrompt,
  CHAPTER_MAX_TOKENS,
  getFlashcardUserPrompt,
  getQuizSystemPrompt,
  getQuizUserPrompt,
} from "@/lib/ai/prompts";
import { canGenerate, chargeGenerationOnce, PLAN_LIMITS } from "@/lib/subscription";
import {
  aiCapReached,
  CAPACITY_MESSAGE,
  durableRateLimit,
  regenerateBlocked,
  REGENERATE_COOLDOWN_MESSAGE,
} from "@/lib/limits";

type GeneratePhase = "chapter" | "flashcards" | "quiz";

interface GenerateRequestBody {
  conversion_id: string;
  level: TextbookLevel;
  ai_provider: AIProvider;
  phase: GeneratePhase;
  chapter_number?: number;
}

// Hobby + Fluid compute allows up to 300s. A full Sonnet 4.6 chapter (max_tokens 8192) takes ~1.5–2 min,
// so 60s killed every chapter mid-stream (no done event, no ledger row, no saved chapter).
export const maxDuration = 300;
/** Abort the model call here, leaving ~30s to save the chapter and finalize the ledger. */
const CHAPTER_DEADLINE_MS = 265_000;
const LEDGER_HEARTBEAT_MS = 15_000;

const VALID_LEVELS: TextbookLevel[] = [101, 201, 301, 401, 501];

function extractChapterTitle(markdown: string): string {
  const headingMatch = markdown.match(/^#\s+(.+)$/m);
  if (headingMatch) {
    return headingMatch[1].trim();
  }
  return "Untitled Chapter";
}

function parseJsonFromAIResponse(text: string): unknown {
  // Try direct parse first
  try {
    return JSON.parse(text);
  } catch {
    // Try extracting from code block
  }

  // Try extracting from ```json ... ``` blocks
  const jsonBlockMatch = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
  if (jsonBlockMatch) {
    try {
      return JSON.parse(jsonBlockMatch[1].trim());
    } catch {
      // Fall through
    }
  }

  // Try finding an array in the text
  const arrayMatch = text.match(/\[[\s\S]*\]/);
  if (arrayMatch) {
    try {
      return JSON.parse(arrayMatch[0]);
    } catch {
      // Fall through
    }
  }

  throw new Error("Failed to parse JSON from AI response");
}

/** Shadow-mode check (PR 1): another conversion of the same repo + commit already has all 3 chapters at this level. */
async function wouldHaveHit(
  admin: ReturnType<typeof createAdminClient>,
  conversionId: string,
  repoKey: string,
  commitSha: string,
  level: number
): Promise<boolean | null> {
  try {
    const { data: siblings } = await admin
      .from("conversions")
      .select("id")
      .eq("repo_key", repoKey)
      .eq("commit_sha", commitSha)
      .neq("id", conversionId)
      .limit(50);
    const ids = (siblings ?? []).map((r) => r.id as string);
    if (!ids.length) return false;
    const { data: chapters } = await admin
      .from("chapters")
      .select("conversion_id, chapter_number")
      .in("conversion_id", ids)
      .eq("level", level);
    const byConv = new Map<string, Set<number>>();
    for (const c of chapters ?? []) {
      const set = byConv.get(c.conversion_id as string) ?? new Set<number>();
      set.add(c.chapter_number as number);
      byConv.set(c.conversion_id as string, set);
    }
    return [...byConv.values()].some((set) => set.size >= 3);
  } catch {
    return null;
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401 }
      );
    }

    if (!(await durableRateLimit(createAdminClient(), `generate:${user.id}`, 20))) {
      return NextResponse.json(
        { error: "Too many requests. Please wait a moment." },
        { status: 429, headers: { "X-RateLimit-Remaining": "0" } }
      );
    }

    const body: GenerateRequestBody = await request.json();

    if (!body.conversion_id || typeof body.conversion_id !== "string") {
      return NextResponse.json(
        { error: "conversion_id is required" },
        { status: 400 }
      );
    }

    if (!body.level || !VALID_LEVELS.includes(body.level)) {
      return NextResponse.json(
        { error: "Valid level is required (101, 201, 301, 401, or 501)" },
        { status: 400 }
      );
    }

    const phase = body.phase || "chapter";
    if (!["chapter", "flashcards", "quiz"].includes(phase)) {
      return NextResponse.json(
        { error: "Valid phase is required (chapter, flashcards, or quiz)" },
        { status: 400 }
      );
    }

    // Fetch the conversion
    const { data: conversion, error: fetchError } = await supabase
      .from("conversions")
      .select("*")
      .eq("id", body.conversion_id)
      .eq("user_id", user.id)
      .single();

    if (fetchError || !conversion) {
      return NextResponse.json(
        { error: "Conversion not found" },
        { status: 404 }
      );
    }

    const providerRaw = body.ai_provider || conversion.ai_provider || "claude";
    if (!["claude", "openai", "grok"].includes(providerRaw)) {
      return NextResponse.json(
        { error: "Invalid AI provider" },
        { status: 400 }
      );
    }
    const provider = providerRaw as AIProvider;

    // ── CHAPTER PHASE ──────────────────────────────────────────────
    if (phase === "chapter") {
      const chapterNumber = body.chapter_number ?? 1;
      if (chapterNumber < 1 || chapterNumber > 5) {
        return NextResponse.json(
          { error: "chapter_number must be between 1 and 5" },
          { status: 400 }
        );
      }

      const admin = createAdminClient();
      const convFields = conversion as ConversionRepoFields;
      let eligible = await isCacheEligible(admin, convFields, user.id);
      let versionId: string | null = null;

      if (chapterNumber === 1) {
        // Check if any chapters already exist for this level (FR-2.5 keeps the 409)
        const { data: existingChapter } = await supabase
          .from("chapters")
          .select("id")
          .eq("conversion_id", body.conversion_id)
          .eq("level", body.level)
          .limit(1)
          .single();

        if (existingChapter) {
          return NextResponse.json(
            { error: "Content already generated for this level. Delete existing content first." },
            { status: 409 }
          );
        }

        if (eligible) {
          // FR-2.5: a ready version for this exact commit is served instead of generated.
          const ready = await readyVersionForSha(admin, convFields.repo_key!, convFields.commit_sha!, body.level);
          if (ready) return NextResponse.json({ cached: true, version_id: ready });
          // US-4: someone else is already building it; wait instead of spending quota.
          const { data: building } = await admin
            .from("guide_versions")
            .select("id, lease_owner, lease_expires_at")
            .eq("repo_key", convFields.repo_key!)
            .eq("commit_sha", convFields.commit_sha!)
            .eq("level", body.level)
            .eq("status", "generating")
            .maybeSingle();
          if (
            building &&
            building.lease_owner !== user.id &&
            building.lease_expires_at &&
            new Date(building.lease_expires_at as string).getTime() > Date.now()
          ) {
            return NextResponse.json({ status: "generating", version_id: building.id }, { status: 202 });
          }
        }
      }

      // Check generation limits only on chapter 1
      if (chapterNumber === 1) {
        const { allowed, plan, limit } = await canGenerate(supabase, user.id);
        if (!allowed) {
          const limitMessages: Record<string, string> = {
            free: `Free tier limit reached (${limit} ${limit === 1 ? "generation" : "generations"}). Upgrade to a paid plan for more generations per month.`,
            standard: `Monthly generation limit reached (${limit}). Upgrade to Pro for ${PLAN_LIMITS.pro}/month or Master for ${PLAN_LIMITS.master}/month, or wait for your next billing cycle.`,
            pro: `Monthly generation limit reached (${limit}). Upgrade to Master for ${PLAN_LIMITS.master}/month, or wait for your next billing cycle.`,
            master: `Monthly generation limit reached (${limit}). Your limit resets at the start of your next billing cycle.`,
          };
          const message = limitMessages[plan] ?? limitMessages.free;
          // limit_reached/plan/limit drive the upgrade card on the conversion page.
          return NextResponse.json(
            { error: message, upgrade_required: plan === "free", limit_reached: true, plan, limit },
            { status: 403 }
          );
        }

        // FR-8.3: daily AI spend cap. Cache hits returned above are never blocked.
        const cap = await aiCapReached(admin);
        if (cap.reached) {
          await recordLedger(admin, {
            user_id: user.id,
            conversion_id: conversion.id as string,
            repo_key: (conversion.repo_key as string | null) ?? null,
            level: body.level,
            phase: "chapter_1",
            outcome: "refused",
            cache_eligible: eligible,
            detail: "daily_cap",
          });
          return NextResponse.json({ error: CAPACITY_MESSAGE, capacity: true }, { status: 503 });
        }

        // FR-8.2: one Regenerate per (repo, level) per 6 hours across all users.
        if (eligible) {
          const { data: priorVersions } = await admin
            .from("guide_versions")
            .select("commit_sha, status, created_at")
            .eq("repo_key", convFields.repo_key!)
            .eq("level", body.level)
            .in("status", ["generating", "ready"]);
          if (regenerateBlocked(priorVersions ?? [], convFields.commit_sha!)) {
            await recordLedger(admin, {
              user_id: user.id,
              conversion_id: conversion.id as string,
              repo_key: convFields.repo_key ?? null,
              level: body.level,
              phase: "chapter_1",
              outcome: "refused",
              cache_eligible: true,
              detail: "regenerate_cooldown",
            });
            return NextResponse.json({ error: REGENERATE_COOLDOWN_MESSAGE, cooldown: true }, { status: 429 });
          }
        }

        if (eligible) {
          // FR-4.1: single-flight claim of (repo, sha, level, prompt_version).
          const claim = await claimVersion(
            admin,
            convFields,
            body.level,
            user.id,
            provider,
            PROVIDER_MODELS[provider],
            sha256(String(conversion.source_content ?? ""))
          );
          if (claim.claimed) {
            versionId = claim.version_id;
          } else if (claim.status === "ready") {
            return NextResponse.json({ cached: true, version_id: claim.version_id });
          } else if (claim.status === "generating") {
            return NextResponse.json({ status: "generating", version_id: claim.version_id }, { status: 202 });
          } else {
            // withdrawn: never re-shared; build a private guide as today.
            eligible = false;
          }
        }
      } else if (eligible) {
        versionId = await heldVersion(admin, convFields, body.level, user.id);
      }

      const sourceContent = conversion.source_content as string;
      const title = conversion.title as string;
      const cacheEligible = eligible;
      // PR 1 shadow mode: would this level have been a cache hit?
      const wouldHit =
        chapterNumber === 1 && cacheEligible
          ? await wouldHaveHit(admin, conversion.id, conversion.repo_key, conversion.commit_sha, body.level)
          : null;
      let usage: TokenUsage | null = null;
      const ledgerBase = {
        user_id: user.id,
        conversion_id: conversion.id as string,
        repo_key: (conversion.repo_key as string | null) ?? null,
        level: body.level,
        cache_eligible: cacheEligible,
        guide_version_id: versionId,
        ai_provider: provider,
        model: PROVIDER_MODELS[provider],
      };

      const aiMessages = [
        { role: "system" as const, content: getTextbookSystemPrompt(body.level) },
        {
          role: "user" as const,
          content: getTextbookUserPrompt(title, sourceContent, body.level, chapterNumber),
        },
      ];

      // Ledger row first, so a killed invocation still leaves a record (finalized below).
      const promptChars = aiMessages.reduce((n, m) => n + m.content.length, 0);
      const ledgerId = await startLedger(admin, { ...ledgerBase, phase: `chapter_${chapterNumber}`, would_hit: wouldHit });
      const estimate = (): TokenUsage => ({
        inputTokens: usage?.inputTokens || estimateTokens(promptChars),
        outputTokens: Math.max(usage?.outputTokens ?? 0, estimateTokens(fullContent.length)),
      });

      // Abort upstream before Vercel's 300s limit so we always get to record the outcome.
      const abort = new AbortController();
      let abortReason: "deadline" | "client_disconnected" | null = null;
      const deadline = setTimeout(() => {
        abortReason = "deadline";
        abort.abort();
      }, CHAPTER_DEADLINE_MS);
      let stopReason: string | null = null;
      let lastBeat = Date.now();

      // Stream the chapter content via SSE
      const aiStream = streamAI(
        provider,
        aiMessages,
        (u) => {
          usage = u;
        },
        { maxTokens: CHAPTER_MAX_TOKENS, signal: abort.signal, onStopReason: (r) => (stopReason = r) }
      );
      const reader = aiStream.getReader();

      const encoder = new TextEncoder();
      let fullContent = "";

      const finishAborted = async (detail: string) => {
        clearTimeout(deadline);
        await finishLedger(admin, ledgerId, {
          ...ledgerBase,
          phase: `chapter_${chapterNumber}`,
          outcome: abortReason ? "aborted" : "failed",
          usage: estimate(),
          usage_estimated: true,
          would_hit: wouldHit,
          detail,
        });
        if (versionId) await failVersion(admin, versionId, `chapter ${chapterNumber} ${abortReason ?? "stream error"}`);
      };

      const responseStream = new ReadableStream({
        async cancel() {
          // Client went away: stop paying for tokens nobody will see.
          abortReason = abortReason ?? "client_disconnected";
          abort.abort();
          await finishAborted(abortReason);
        },
        async pull(controller) {
          let done: boolean;
          let value: string | undefined;
          try {
            ({ done, value } = await reader.read());
          } catch (streamError) {
            // After cancel() the stream is closed and cancel() already finalized the ledger.
            if (abortReason === "client_disconnected") return;
            await finishAborted(
              abortReason ?? (streamError instanceof Error ? streamError.message.slice(0, 300) : "stream error")
            );
            controller.enqueue(
              encoder.encode(
                `data: ${JSON.stringify({ done: true, chapter: { id: null }, error: abortReason === "deadline" ? "Generation took too long. Please try again." : "Generation failed. Please try again." })}\n\n`
              )
            );
            controller.close();
            return;
          }
          if (done) {
            clearTimeout(deadline);
            // Stream complete — save to DB, send final event
            const keyConcepts = extractKeyConcepts(fullContent);
            const chapterTitle = extractChapterTitle(fullContent);

            // Upsert: a retried/concurrent request replaces the row instead of duplicating it.
            // Conversion ownership was checked above with the user's client.
            const { data: chapter, error: chapterError } = await admin
              .from("chapters")
              .upsert(
                {
                  conversion_id: body.conversion_id,
                  level: body.level,
                  chapter_number: chapterNumber,
                  title: chapterTitle,
                  content: fullContent,
                  key_concepts: keyConcepts,
                },
                { onConflict: "conversion_id,level,chapter_number" }
              )
              .select()
              .single();

            // Charge at most once per (conversion, level), and never twice for the same shared guide.
            const charged =
              chapterNumber === 1 && !chapterError
                ? await chargeGenerationOnce(admin, user.id, body.conversion_id, body.level, versionId)
                : false;

            // FR-4.2: the server writes the same AI output into the shared cache (never copied from user rows, D9).
            if (versionId) {
              if (chapterError) {
                await failVersion(admin, versionId, `chapter ${chapterNumber} store error`);
              } else {
                await admin.from("guide_chapters").upsert(
                  {
                    guide_version_id: versionId,
                    chapter_number: chapterNumber,
                    title: chapterTitle,
                    content: fullContent,
                    key_concepts: keyConcepts,
                  },
                  { onConflict: "guide_version_id,chapter_number" }
                );
                await renewLease(admin, versionId);
              }
            }

            await finishLedger(admin, ledgerId, {
              ...ledgerBase,
              phase: `chapter_${chapterNumber}`,
              outcome: chapterError ? "failed" : "generated",
              usage: usage ?? estimate(),
              usage_estimated: !usage,
              quota_charged: charged,
              would_hit: wouldHit,
              detail: chapterError?.message ?? (stopReason === "max_tokens" ? "truncated: max_tokens" : null),
            });

            const doneData = JSON.stringify({
              done: true,
              chapter: chapter ?? { id: null },
              error: chapterError?.message ?? null,
            });
            controller.enqueue(encoder.encode(`data: ${doneData}\n\n`));
            controller.close();
            return;
          }

          fullContent += value ?? "";
          const chunkData = JSON.stringify({ text: value });
          controller.enqueue(encoder.encode(`data: ${chunkData}\n\n`));
          if (Date.now() - lastBeat > LEDGER_HEARTBEAT_MS) {
            lastBeat = Date.now();
            void progressLedger(admin, ledgerId, PROVIDER_MODELS[provider], estimate());
            if (versionId) void renewLease(admin, versionId);
          }
        },
      });

      return new Response(responseStream, {
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          Connection: "keep-alive",
        },
      });
    }

    // ── FLASHCARDS PHASE ───────────────────────────────────────────
    if (phase === "flashcards") {
      // Read the chapter from DB (must exist)
      const { data: chapter, error: chapterFetchError } = await supabase
        .from("chapters")
        .select("content")
        .eq("conversion_id", body.conversion_id)
        .eq("level", body.level)
        .limit(1)
        .single();

      if (chapterFetchError || !chapter) {
        return NextResponse.json(
          { error: "Chapter must be generated before flashcards" },
          { status: 400 }
        );
      }

      const flashcardResponse = await callAI(provider, [
        { role: "system", content: getFlashcardSystemPrompt() },
        {
          role: "user",
          content: getFlashcardUserPrompt(chapter.content, body.level),
        },
      ]);

      const fcAdmin = createAdminClient();
      const fcVersion = await heldVersion(fcAdmin, conversion as ConversionRepoFields, body.level, user.id);
      await recordLedger(fcAdmin, {
        user_id: user.id,
        conversion_id: conversion.id,
        guide_version_id: fcVersion,
        repo_key: conversion.repo_key ?? null,
        level: body.level,
        phase: "flashcards",
        outcome: "generated",
        cache_eligible: Boolean(conversion.commit_sha && conversion.repo_key),
        ai_provider: provider,
        model: flashcardResponse.model,
        usage: flashcardResponse.usage,
      });

      let flashcardsData: { front: string; back: string; difficulty: number }[] = [];
      try {
        const parsed = parseJsonFromAIResponse(flashcardResponse.content);
        if (Array.isArray(parsed)) {
          flashcardsData = parsed.map((card: Record<string, unknown>) => ({
            front: String(card.front || ""),
            back: String(card.back || ""),
            difficulty: typeof card.difficulty === "number"
              ? Math.min(5, Math.max(1, card.difficulty))
              : 3,
          }));
        }
      } catch (parseError) {
        console.error("Failed to parse flashcards:", parseError);
        if (fcVersion) await failVersion(fcAdmin, fcVersion, "flashcards parse error");
        return NextResponse.json(
          { error: "Failed to parse flashcard data from AI" },
          { status: 500 }
        );
      }

      let flashcards: Record<string, unknown>[] = [];
      if (flashcardsData.length > 0) {
        const flashcardRows = flashcardsData.map((card) => ({
          conversion_id: body.conversion_id,
          level: body.level,
          front: card.front,
          back: card.back,
          difficulty: card.difficulty,
        }));

        const { data: insertedFlashcards, error: flashcardError } = await supabase
          .from("flashcards")
          .insert(flashcardRows)
          .select();

        if (flashcardError) {
          return NextResponse.json(
            { error: "Failed to store flashcards", details: flashcardError.message },
            { status: 500 }
          );
        }
        flashcards = insertedFlashcards || [];
      }

      if (fcVersion) {
        if (flashcardsData.length) {
          await fcAdmin.from("guide_flashcards").insert(
            flashcardsData.map((card) => ({ guide_version_id: fcVersion, ...card }))
          );
        }
        await renewLease(fcAdmin, fcVersion);
        if (await tryFinalize(fcAdmin, fcVersion)) await computeListing(fcAdmin, fcVersion);
      }

      return NextResponse.json({ flashcards });
    }

    // ── QUIZ PHASE ─────────────────────────────────────────────────
    if (phase === "quiz") {
      // Read the chapter from DB (must exist)
      const { data: chapter, error: chapterFetchError } = await supabase
        .from("chapters")
        .select("content")
        .eq("conversion_id", body.conversion_id)
        .eq("level", body.level)
        .limit(1)
        .single();

      if (chapterFetchError || !chapter) {
        return NextResponse.json(
          { error: "Chapter must be generated before quiz" },
          { status: 400 }
        );
      }

      const quizResponse = await callAI(provider, [
        { role: "system", content: getQuizSystemPrompt() },
        {
          role: "user",
          content: getQuizUserPrompt(chapter.content, body.level, 10),
        },
      ]);

      const qAdmin = createAdminClient();
      const qVersion = await heldVersion(qAdmin, conversion as ConversionRepoFields, body.level, user.id);
      await recordLedger(qAdmin, {
        user_id: user.id,
        conversion_id: conversion.id,
        guide_version_id: qVersion,
        repo_key: conversion.repo_key ?? null,
        level: body.level,
        phase: "quiz",
        outcome: "generated",
        cache_eligible: Boolean(conversion.commit_sha && conversion.repo_key),
        ai_provider: provider,
        model: quizResponse.model,
        usage: quizResponse.usage,
      });

      let quizData: {
        question: string;
        options: string[];
        correct_answer: number;
        explanation: string;
      }[] = [];

      try {
        const parsed = parseJsonFromAIResponse(quizResponse.content);
        if (Array.isArray(parsed)) {
          quizData = parsed.map((q: Record<string, unknown>) => ({
            question: String(q.question || ""),
            options: Array.isArray(q.options) ? q.options.map(String) : [],
            correct_answer: typeof q.correct_answer === "number"
              ? Math.min(3, Math.max(0, q.correct_answer))
              : 0,
            explanation: String(q.explanation || ""),
          }));
        }
      } catch (parseError) {
        console.error("Failed to parse quiz:", parseError);
        if (qVersion) await failVersion(qAdmin, qVersion, "quiz parse error");
        return NextResponse.json(
          { error: "Failed to parse quiz data from AI" },
          { status: 500 }
        );
      }

      let quizQuestions: Record<string, unknown>[] = [];
      if (quizData.length > 0) {
        const quizRows = quizData.map((q) => ({
          conversion_id: body.conversion_id,
          level: body.level,
          question: q.question,
          options: q.options,
          correct_answer: q.correct_answer,
          explanation: q.explanation,
        }));

        const { data: insertedQuestions, error: quizError } = await supabase
          .from("quiz_questions")
          .insert(quizRows)
          .select();

        if (quizError) {
          return NextResponse.json(
            { error: "Failed to store quiz questions", details: quizError.message },
            { status: 500 }
          );
        }
        quizQuestions = insertedQuestions || [];
      }

      if (qVersion) {
        if (quizData.length) {
          await qAdmin.from("guide_quiz_questions").insert(
            quizData.map((q) => ({ guide_version_id: qVersion, ...q }))
          );
        }
        await renewLease(qAdmin, qVersion);
        if (await tryFinalize(qAdmin, qVersion)) await computeListing(qAdmin, qVersion);
      }

      return NextResponse.json({ quiz_questions: quizQuestions });
    }

    return NextResponse.json({ error: "Invalid phase" }, { status: 400 });
  } catch (error) {
    console.error("Generation error:", error);
    const message = error instanceof Error ? error.message : "Internal server error";
    return NextResponse.json(
      { error: message },
      { status: 500 }
    );
  }
}
