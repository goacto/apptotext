import { createHash } from "node:crypto";
import { ghFetch, serverToken, type RepoMeta } from "./api";

/** FR-1.7: source fetch pinned to a commit SHA. API calls: 1 (tree). Files come from raw.githubusercontent.com at the SHA. */
export interface PinnedSource {
  title: string;
  description: string;
  content: string;
  sourceHash: string;
  hasReadme: boolean;
  treeEntries: number;
}

const KEY_FILES = [
  "src/index.ts", "src/index.js", "src/main.ts", "src/main.js", "src/app.ts", "src/app.js",
  "index.ts", "index.js", "main.ts", "main.js", "app.ts", "app.js",
  "src/lib/index.ts", "src/lib/main.ts", "lib/index.ts", "lib/main.ts",
];

const README_RE = /^readme(\.(md|markdown|mdx|rst|txt))?$/i;

export function sha256(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

export function pickReadme(paths: string[]): string | null {
  const root = paths.filter((p) => !p.includes("/") && README_RE.test(p));
  return root.find((p) => /\.md$/i.test(p)) ?? root[0] ?? null;
}

async function raw(fullName: string, sha: string, path: string): Promise<string | null> {
  const url = `https://raw.githubusercontent.com/${fullName}/${sha}/${path.split("/").map(encodeURIComponent).join("/")}`;
  try {
    const res = await fetch(url, { headers: { "User-Agent": "AppToText" }, cache: "no-store" });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
}

export async function fetchPinnedSource(meta: RepoMeta, sha: string): Promise<PinnedSource> {
  const title = meta.full_name;
  const description = meta.description || "No description available";
  const parts: string[] = [
    `# ${title}\n`,
    `${description}\n`,
    `Language: ${meta.language || "Unknown"}`,
    `Stars: ${meta.stars}`,
    `Forks: ${meta.forks}`,
    `Commit: ${sha}\n`,
  ];

  let blobs: { path: string; size?: number }[] = [];
  const treeRes = await ghFetch(
    `/repos/${encodeURIComponent(meta.owner)}/${encodeURIComponent(meta.name)}/git/trees/${sha}?recursive=1`,
    { token: serverToken() }
  );
  if (treeRes.ok) {
    const tree = await treeRes.json();
    blobs = (tree.tree || []).filter((t: { type: string }) => t.type === "blob");
  }
  const paths = blobs.map((b) => b.path);
  const sizes = new Map(blobs.map((b) => [b.path, b.size ?? 0]));

  const readmePath = pickReadme(paths);
  const readme = readmePath ? await raw(meta.full_name, sha, readmePath) : null;
  if (readme) {
    parts.push("## README\n", readme, "");
  }

  if (paths.length) {
    parts.push("## File Structure\n", "```");
    paths.slice(0, 200).forEach((p) => parts.push(p));
    if (paths.length > 200) parts.push(`... and ${paths.length - 200} more files`);
    parts.push("```\n");
  }

  if (sizes.has("package.json")) {
    const pkg = await raw(meta.full_name, sha, "package.json");
    if (pkg) parts.push("## package.json\n", "```json", pkg, "```\n");
  }

  const keys = KEY_FILES.filter((p) => sizes.has(p) && (sizes.get(p) ?? 0) < 50000).slice(0, 3);
  const keyContents = await Promise.all(keys.map((p) => raw(meta.full_name, sha, p)));
  keys.forEach((p, i) => {
    const body = keyContents[i];
    if (!body) return;
    parts.push(`## ${p}\n`, `\`\`\`${p.split(".").pop() || "text"}`, body, "```\n");
  });

  const content = parts.join("\n");
  return { title, description, content, sourceHash: sha256(content), hasReadme: Boolean(readme), treeEntries: paths.length };
}
