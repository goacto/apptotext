import type { Metadata } from "next";

// FR-6.5: private app routes are never indexed.
export const metadata: Metadata = { robots: { index: false, follow: false } };

export default function NoIndexLayout({ children }: { children: React.ReactNode }) {
  return children;
}
