"use client";

import React from "react";

interface MarkdownRendererProps {
  content: string;
  className?: string;
}

// No HTML escaping needed — React handles XSS protection automatically.
// We only strip raw HTML tags to prevent injection of actual DOM elements.
function sanitizeContent(text: string): string {
  return text.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "");
}

function parseInline(text: string): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  // Match inline code, bold, italic in order of precedence
  const inlineRegex =
    /(`[^`]+`)|(\*\*[^*]+\*\*)|(\*[^*]+\*)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = inlineRegex.exec(text)) !== null) {
    // Add any plain text before this match
    if (match.index > lastIndex) {
      nodes.push(text.slice(lastIndex, match.index));
    }

    if (match[1]) {
      // Inline code: `code`
      const code = match[1].slice(1, -1);
      nodes.push(
        <code
          key={`code-${match.index}`}
          className="rounded bg-muted px-1.5 py-0.5 font-mono text-sm text-foreground"
        >
          {code}
        </code>
      );
    } else if (match[2]) {
      // Bold: **text**
      const bold = match[2].slice(2, -2);
      nodes.push(
        <strong key={`bold-${match.index}`} className="font-semibold">
          {bold}
        </strong>
      );
    } else if (match[3]) {
      // Italic: *text*
      const italic = match[3].slice(1, -1);
      nodes.push(
        <em key={`italic-${match.index}`} className="italic">
          {italic}
        </em>
      );
    }

    lastIndex = match.index + match[0].length;
  }

  // Add remaining text
  if (lastIndex < text.length) {
    nodes.push(text.slice(lastIndex));
  }

  return nodes.length > 0 ? nodes : [text];
}

interface BlockNode {
  type:
    | "h2"
    | "h3"
    | "code-block"
    | "blockquote"
    | "ul"
    | "ol"
    | "paragraph";
  content: string;
  language?: string;
  items?: string[];
}

function parseBlocks(text: string): BlockNode[] {
  const blocks: BlockNode[] = [];
  const lines = text.split("\n");
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Code block: ```
    if (line.trimStart().startsWith("```")) {
      const language = line.trimStart().slice(3).trim();
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i].trimStart().startsWith("```")) {
        codeLines.push(lines[i]);
        i++;
      }
      blocks.push({
        type: "code-block",
        content: codeLines.join("\n"),
        language: language || undefined,
      });
      i++; // skip closing ```
      continue;
    }

    // Heading ## (check ### first)
    if (line.startsWith("### ")) {
      blocks.push({ type: "h3", content: line.slice(4).trim() });
      i++;
      continue;
    }

    if (line.startsWith("## ")) {
      blocks.push({ type: "h2", content: line.slice(3).trim() });
      i++;
      continue;
    }

    // Blockquote: > text
    if (line.startsWith("> ")) {
      const quoteLines: string[] = [];
      while (i < lines.length && lines[i].startsWith("> ")) {
        quoteLines.push(lines[i].slice(2));
        i++;
      }
      blocks.push({ type: "blockquote", content: quoteLines.join("\n") });
      continue;
    }

    // Unordered list: - item
    if (/^[-*]\s/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^[-*]\s/.test(lines[i])) {
        items.push(lines[i].replace(/^[-*]\s/, ""));
        i++;
      }
      blocks.push({ type: "ul", content: "", items });
      continue;
    }

    // Ordered list: 1. item
    if (/^\d+\.\s/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\d+\.\s/.test(lines[i])) {
        items.push(lines[i].replace(/^\d+\.\s/, ""));
        i++;
      }
      blocks.push({ type: "ol", content: "", items });
      continue;
    }

    // Empty line - skip
    if (line.trim() === "") {
      i++;
      continue;
    }

    // Paragraph: collect consecutive non-empty, non-special lines
    const paraLines: string[] = [];
    while (
      i < lines.length &&
      lines[i].trim() !== "" &&
      !lines[i].startsWith("## ") &&
      !lines[i].startsWith("### ") &&
      !lines[i].startsWith("> ") &&
      !lines[i].trimStart().startsWith("```") &&
      !/^[-*]\s/.test(lines[i]) &&
      !/^\d+\.\s/.test(lines[i])
    ) {
      paraLines.push(lines[i]);
      i++;
    }

    if (paraLines.length > 0) {
      blocks.push({ type: "paragraph", content: paraLines.join(" ") });
    }
  }

  return blocks;
}

export function MarkdownRenderer({ content, className }: MarkdownRendererProps) {
  const sanitized = sanitizeContent(content);
  const blocks = parseBlocks(sanitized);

  return (
    <div className={className}>
      {blocks.map((block, index) => {
        switch (block.type) {
          case "h2":
            return (
              <h2
                key={index}
                className="mt-8 mb-4 text-2xl font-bold tracking-tight text-foreground first:mt-0"
              >
                {parseInline(block.content)}
              </h2>
            );

          case "h3":
            return (
              <h3
                key={index}
                className="mt-6 mb-3 text-xl font-semibold tracking-tight text-foreground"
              >
                {parseInline(block.content)}
              </h3>
            );

          case "code-block":
            return (
              <div key={index} className="my-4 overflow-hidden rounded-lg border bg-muted/50">
                {block.language && (
                  <div className="border-b bg-muted px-4 py-1.5 text-xs font-medium text-muted-foreground">
                    {block.language}
                  </div>
                )}
                <pre className="overflow-x-auto p-4">
                  <code className="font-mono text-sm leading-relaxed text-foreground">
                    {block.content}
                  </code>
                </pre>
              </div>
            );

          case "blockquote":
            return (
              <blockquote
                key={index}
                className="my-4 border-l-4 border-primary/30 pl-4 italic text-muted-foreground"
              >
                {parseInline(block.content)}
              </blockquote>
            );

          case "ul":
            return (
              <ul key={index} className="my-4 ml-6 list-disc space-y-1.5 text-foreground">
                {block.items?.map((item, itemIndex) => (
                  <li key={itemIndex} className="leading-relaxed">
                    {parseInline(item)}
                  </li>
                ))}
              </ul>
            );

          case "ol":
            return (
              <ol key={index} className="my-4 ml-6 list-decimal space-y-1.5 text-foreground">
                {block.items?.map((item, itemIndex) => (
                  <li key={itemIndex} className="leading-relaxed">
                    {parseInline(item)}
                  </li>
                ))}
              </ol>
            );

          case "paragraph":
            return (
              <p key={index} className="my-3 leading-7 text-foreground/90">
                {parseInline(block.content)}
              </p>
            );

          default:
            return null;
        }
      })}
    </div>
  );
}
