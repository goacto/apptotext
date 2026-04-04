import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { AIProvider } from "@/lib/types";
import { XP_REWARDS } from "@/lib/constants";
import { rateLimit } from "@/lib/rate-limit";

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

function parseGitHubUrl(url: string): { owner: string; repo: string } | null {
  try {
    const parsed = new URL(url);
    const parts = parsed.pathname.split("/").filter(Boolean);
    if (parts.length >= 2) {
      return { owner: parts[0], repo: parts[1] };
    }
    return null;
  } catch {
    return null;
  }
}

async function fetchGitHubContent(url: string): Promise<{
  title: string;
  description: string;
  content: string;
}> {
  const parsed = parseGitHubUrl(url);
  if (!parsed) {
    throw new Error("Invalid GitHub URL");
  }

  const { owner, repo } = parsed;
  const headers: Record<string, string> = {
    Accept: "application/vnd.github.v3+json",
    "User-Agent": "AppToText",
  };

  if (process.env.GITHUB_TOKEN) {
    headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  }

  const repoResponse = await fetch(
    `https://api.github.com/repos/${owner}/${repo}`,
    { headers }
  );

  if (!repoResponse.ok) {
    throw new Error(`Failed to fetch GitHub repository: ${repoResponse.statusText}`);
  }

  const repoData = await repoResponse.json();
  const title = repoData.full_name || `${owner}/${repo}`;
  const description = repoData.description || "No description available";

  const contentParts: string[] = [];
  contentParts.push(`# ${title}\n`);
  contentParts.push(`${description}\n`);
  contentParts.push(`Language: ${repoData.language || "Unknown"}`);
  contentParts.push(`Stars: ${repoData.stargazers_count}`);
  contentParts.push(`Forks: ${repoData.forks_count}\n`);

  // Fetch README
  try {
    const readmeResponse = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/readme`,
      { headers }
    );
    if (readmeResponse.ok) {
      const readmeData = await readmeResponse.json();
      const readmeContent = Buffer.from(readmeData.content, "base64").toString("utf-8");
      contentParts.push("## README\n");
      contentParts.push(readmeContent);
      contentParts.push("");
    }
  } catch {
    // README not available, continue
  }

  // Fetch file tree (top level + src directory)
  try {
    const treeResponse = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/git/trees/HEAD?recursive=1`,
      { headers }
    );
    if (treeResponse.ok) {
      const treeData = await treeResponse.json();
      const files = (treeData.tree || [])
        .filter((item: { type: string }) => item.type === "blob")
        .map((item: { path: string }) => item.path);

      contentParts.push("## File Structure\n");
      contentParts.push("```");
      files.slice(0, 200).forEach((file: string) => {
        contentParts.push(file);
      });
      if (files.length > 200) {
        contentParts.push(`... and ${files.length - 200} more files`);
      }
      contentParts.push("```\n");
    }
  } catch {
    // Tree not available, continue
  }

  // Fetch package.json if it exists
  try {
    const pkgResponse = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/contents/package.json`,
      { headers }
    );
    if (pkgResponse.ok) {
      const pkgData = await pkgResponse.json();
      const pkgContent = Buffer.from(pkgData.content, "base64").toString("utf-8");
      contentParts.push("## package.json\n");
      contentParts.push("```json");
      contentParts.push(pkgContent);
      contentParts.push("```\n");
    }
  } catch {
    // package.json not available
  }

  // Fetch key source files (index/main entry points)
  const keyFiles = [
    "src/index.ts",
    "src/index.js",
    "src/main.ts",
    "src/main.js",
    "src/app.ts",
    "src/app.js",
    "index.ts",
    "index.js",
    "main.ts",
    "main.js",
    "app.ts",
    "app.js",
    "src/lib/index.ts",
    "src/lib/main.ts",
    "lib/index.ts",
    "lib/main.ts",
  ];

  const fileResults = await Promise.all(
    keyFiles.map(async (filePath) => {
      try {
        const fileResponse = await fetch(
          `https://api.github.com/repos/${owner}/${repo}/contents/${filePath}`,
          { headers }
        );
        if (fileResponse.ok) {
          const fileData = await fileResponse.json();
          if (fileData.size && fileData.size < 50000) {
            const fileContent = Buffer.from(fileData.content, "base64").toString("utf-8");
            const extension = filePath.split(".").pop() || "text";
            return { filePath, extension, fileContent };
          }
        }
      } catch {
        // File not available
      }
      return null;
    })
  );

  for (const result of fileResults.filter(Boolean).slice(0, 3)) {
    contentParts.push(`## ${result!.filePath}\n`);
    contentParts.push(`\`\`\`${result!.extension}`);
    contentParts.push(result!.fileContent);
    contentParts.push("```\n");
  }

  return {
    title,
    description,
    content: contentParts.join("\n"),
  };
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

    if (sourceType === "github") {
      fetchedContent = await fetchGitHubContent(body.url);
    } else {
      fetchedContent = await fetchWebsiteContent(body.url);
    }

    // Create conversion record in Supabase
    const { data: conversion, error: insertError } = await supabase
      .from("conversions")
      .insert({
        user_id: user.id,
        source_url: body.url,
        source_type: sourceType,
        source_content: fetchedContent.content,
        title: fetchedContent.title,
        description: fetchedContent.description,
        ai_provider: body.ai_provider,
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
