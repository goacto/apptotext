import Link from "next/link";
import { removalLink } from "@/lib/library/seo";

/** FR-6.8 */
export function LibraryFooter({ repoKey }: { repoKey?: string }) {
  return (
    <footer className="mt-12 flex flex-wrap gap-x-6 gap-y-2 border-t pt-4 text-sm text-muted-foreground">
      <Link href="/pricing" className="underline">
        Pricing
      </Link>
      {repoKey ? (
        <Link href={removalLink(repoKey)} className="underline">
          Own this repo? Request removal
        </Link>
      ) : (
        <Link href="/library/remove" className="underline">
          Own a repo listed here? Request removal
        </Link>
      )}
    </footer>
  );
}
