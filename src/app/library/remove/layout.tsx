import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Request removal | AppToText",
  description: "Own a repository? Ask us to remove its saved guides or never cache it again.",
  robots: { index: false, follow: false },
};

export default function RemoveLayout({ children }: { children: React.ReactNode }) {
  return children;
}
