/**
 * Pull the KEY_CONCEPTS json array from a chapter. Models write it several ways, e.g.
 *   KEY_CONCEPTS\n```json\n[...]\n```      (the original format)
 *   ```json\nKEY_CONCEPTS\n[...]\n```      (claude-sonnet-4-6, seen on prod 2026-10-20)
 *   ```json KEY_CONCEPTS\n[...]\n```
 */
export function extractKeyConcepts(markdown: string): string[] {
  const at = markdown.lastIndexOf("KEY_CONCEPTS");
  if (at === -1) return [];
  const rest = markdown.slice(at);
  const open = rest.indexOf("[");
  if (open === -1) return [];
  const fence = rest.indexOf("```", open);
  const region = fence === -1 ? rest.slice(open) : rest.slice(open, fence);
  const close = region.lastIndexOf("]");
  if (close === -1) return [];
  try {
    const parsed = JSON.parse(region.slice(0, close + 1));
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}
