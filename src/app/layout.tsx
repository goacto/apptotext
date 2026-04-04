import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Header } from "@/components/layout/header";
import { Footer } from "@/components/layout/footer";
import { Toaster } from "@/components/ui/sonner";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const APP_URL = "https://apptotext.com";

export const metadata: Metadata = {
  title: {
    default: "AppToText | GOACTO",
    template: "%s | AppToText",
  },
  description:
    "Transform any codebase or application into a complete learning textbook. Part of the GOACTO ecosystem — Growing Ourselves And Contributing To Others.",
  metadataBase: new URL(APP_URL),
  icons: {
    icon: "/favicon-32.png",
    apple: "/apple-touch-icon.png",
  },
  openGraph: {
    type: "website",
    siteName: "AppToText",
    title: "AppToText — Turn Code into Textbooks",
    description:
      "Transform any codebase or application into a complete learning textbook with AI. Part of the GOACTO ecosystem.",
    url: APP_URL,
    images: [{ url: "/logo.png", width: 512, height: 512, alt: "AppToText" }],
  },
  twitter: {
    card: "summary",
    title: "AppToText — Turn Code into Textbooks",
    description:
      "Transform any codebase into a learning textbook with AI. Part of GOACTO.",
    images: ["/logo.png"],
  },
  robots: {
    index: true,
    follow: true,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <Header />
        <main className="flex-1">{children}</main>
        <Footer />
        <Toaster />
      </body>
    </html>
  );
}
