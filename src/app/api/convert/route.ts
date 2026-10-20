import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { AIProvider } from "@/lib/types";
import { XP_REWARDS } from "@/lib/constants";
import { rateLimit } from "@/lib/rate-limit";
import { createAdminClient } from "@/lib/supabase/admin";
import { GitHubRateLimitError } from "@/lib/github/api";
import { getHeadSha, RepoNotFoundError, RepoNotPublicError, resolveRepo } from "@/lib/github/repos";
import { fetchPinnedSource } from "@/lib/github/source";

export const maxDuration = 60;

interface ConvertRequestBody {
  url: string;
  ai_provider: AIProvider;
}

function isGitHubUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.hostname === "github.com" || parsed.hostname === "www.github.com";
  } catch {
    return false;
  }
}

async function fetchWebsiteContent(url: string): Promise<{
  title: string;
  description: string;
  content: string;
}> {
  const response = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (compatible; AppToText/1.0; +https://apptotext.com)",
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch URL: ${response.statusText}`);
  }

  const contentLength = parseInt(response.headers.get("content-length") || "0");
  if (contentLength > 10_000_000) {
    throw new Error("Page is too large to process (>10MB)");
  }

  const html = await response.text();

  // Extract title
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  let title = titleMatch ? titleMatch[1].trim() : new URL(url).hostname;
  title = decodeHTMLEntities(title);

  // Extract meta description
  const descMatch = html.match(
    /<meta[^>]*name=["']description["'][^>]*content=["']([\s\S]*?)["'][^>]*>/i
  );
  const description = descMatch
    ? decodeHTMLEntities(descMatch[1].trim())
    : `Content from ${new URL(url).hostname}`;

  // Strip scripts, styles, and HTML tags to get text content
  let textContent = html;

  // Remove script and style blocks
  textContent = textContent.replace(/<script[\s\S]*?<\/script>/gi, "");
  textContent = textContent.replace(/<style[\s\S]*?<\/style>/gi, "");
  textContent = textContent.replace(/<noscript[\s\S]*?<\/noscript>/gi, "");
  textContent = textContent.replace(/<svg[\s\S]*?<\/svg>/gi, "");

  // Remove HTML comments
  textContent = textContent.replace(/<!--[\s\S]*?-->/g, "");

  // Convert common block elements to newlines for structure
  textContent = textContent.replace(/<\/?(h[1-6]|p|div|section|article|br|li|tr)[^>]*>/gi, "\n");
  textContent = textContent.replace(/<\/?(ul|ol|table|thead|tbody)[^>]*>/gi, "\n");

  // Remove remaining HTML tags
  textContent = textContent.replace(/<[^>]+>/g, " ");

  // Decode HTML entities
  textContent = decodeHTMLEntities(textContent);

  // Clean up whitespace
  textContent = textContent.replace(/[ \t]+/g, " ");
  textContent = textContent.replace(/\n\s*\n/g, "\n\n");
  textContent = textContent
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .join("\n");

  // Truncate to a reasonable size
  if (textContent.length > 50000) {
    textContent = textContent.slice(0, 50000) + "\n\n[Content truncated]";
  }

  const contentParts = [
    `# ${title}\n`,
    `Source: ${url}\n`,
    textContent,
  ];

  return {
    title,
    description,
    content: contentParts.join("\n"),
  };
}

function decodeHTMLEntities(text: string): string {
  const entities: Record<string, string> = {
    "&amp;": "&",
    "&lt;": "<",
    "&gt;": ">",
    "&quot;": '"',
    "&#39;": "'",
    "&apos;": "'",
    "&nbsp;": " ",
    "&mdash;": "—",
    "&ndash;": "–",
    "&hellip;": "...",
    "&copy;": "(c)",
    "&reg;": "(R)",
    "&trade;": "(TM)",
  };

  let decoded = text;
  for (const [entity, char] of Object.entries(entities)) {
    decoded = decoded.replaceAll(entity, char);
  }

  // Handle numeric entities
  decoded = decoded.replace(/&#(\d+);/g, (_, num) =>
    String.fromCharCode(parseInt(num, 10))
  );
  decoded = decoded.replace(/&#x([0-9a-fA-F]+);/g, (_, hex) =>
    String.fromCharCode(parseInt(hex, 16))
  );

  return decoded;
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

    const { allowed } = rateLimit(`convert:${user.id}`, 10);
    if (!allowed) {
      return NextResponse.json(
        { error: "Too many requests. Please wait a moment." },
        { status: 429 }
      );
    }

    const body: ConvertRequestBody = await request.json();

    if (!body.url || typeof body.url !== "string") {
      return NextResponse.json(
        { error: "URL is required" },
        { status: 400 }
      );
    }

    if (!body.ai_provider || !["claude", "openai", "grok"].includes(body.ai_provider)) {
      return NextResponse.json(
        { error: "Valid AI provider is required (claude, openai, or grok)" },
        { status: 400 }
      );
    }

    // Validate URL format
    try {
      new URL(body.url);
    } catch {
      return NextResponse.json(
        { error: "Invalid URL format" },
        { status: 400 }
      );
    }

    const sourceType = isGitHubUrl(body.url) ? "github" : "website";

    let fetchedContent: { title: string; description: string; content: string };
    let repoFields: { repo_key: string; github_repo_id: number; commit_sha: string } | null = null;

    if (sourceType === "github") {
      // FR-1.x: normalize, resolve (public-only, G4), pin to the default-branch HEAD SHA.
      const admin = createAdminClient();
      try {
        const resolved = await resolveRepo(admin, body.url);
        if (!resolved.isPublic) throw new RepoNotPublicError();
        const head = await getHeadSha(admin, resolved.meta, { userId: user.id });
        const pinned = await fetchPinnedSource(resolved.meta, head.sha);
        await admin
          .from("repos")
          .update({ has_readme: pinned.hasReadme })
          .eq("github_repo_id", resolved.meta.github_repo_id);
        fetchedContent = pinned;
        repoFields = {
          repo_key: resolved.meta.repo_key,
          github_repo_id: resolved.meta.github_repo_id,
          commit_sha: head.sha,
        };
      } catch (e) {
        if (e instanceof RepoNotFoundError) {
          return NextResponse.json({ error: e.message }, { status: 404 });
        }
        if (e instanceof RepoNotPublicError) {
          return NextResponse.json({ error: e.message }, { status: 403 });
        }
        if (e instanceof GitHubRateLimitError) {
          return NextResponse.json({ error: e.message }, { status: 503 });
        }
        throw e;
      }
    } else {
      fetchedContent = await fetchWebsiteContent(body.url);
    }

    // Create conversion record. Repo identity columns are server-only (PR 1 grants), so insert with the service role.
    const { data: conversion, error: insertError } = await createAdminClient()
      .from("conversions")
      .insert({
        user_id: user.id,
        source_url: body.url,
        source_type: sourceType,
        source_content: fetchedContent.content,
        title: fetchedContent.title,
        description: fetchedContent.description,
        ai_provider: body.ai_provider,
        ...(repoFields ?? {}),
      })
      .select()
      .single();

    if (insertError) {
      return NextResponse.json(
        { error: "Failed to create conversion", details: insertError.message },
        { status: 500 }
      );
    }

    // Award XP for creating a conversion
    const { data: currentProfile } = await supabase
      .from("profiles")
      .select("total_xp")
      .eq("id", user.id)
      .single();

    if (currentProfile) {
      await supabase
        .from("profiles")
        .update({
          total_xp: currentProfile.total_xp + XP_REWARDS.CONVERSION_CREATED,
          last_activity: new Date().toISOString(),
        })
        .eq("id", user.id);
    }

    return NextResponse.json(conversion, { status: 201 });
  } catch (error) {
    console.error("Conversion error:", error);
    const message = error instanceof Error ? error.message : "Internal server error";
    return NextResponse.json(
      { error: message },
      { status: 500 }
    );
  }
}
