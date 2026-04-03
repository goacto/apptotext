"use client";

import Link from "next/link";
import { AlertTriangle } from "lucide-react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="flex min-h-full flex-col bg-background text-foreground">
        <div className="flex flex-1 flex-col items-center justify-center px-4">
          <div className="w-full max-w-md text-center">
            {/* Branding */}
            <div className="mb-8">
              <span className="text-2xl font-bold tracking-tight">
                App<span className="text-primary">To</span>Text
              </span>
              <p className="mt-1 text-xs text-muted-foreground">
                Part of the GOACTO Ecosystem
              </p>
            </div>

            {/* Error Icon */}
            <div className="mx-auto mb-6 flex size-16 items-center justify-center rounded-full bg-destructive/10">
              <AlertTriangle className="size-8 text-destructive" />
            </div>

            {/* Error Message */}
            <h1 className="text-2xl font-bold tracking-tight">
              Something went wrong
            </h1>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
              An unexpected error occurred. Our team has been notified. Please
              try again or return to the home page.
            </p>
            {error.digest && (
              <p className="mt-2 text-xs text-muted-foreground/60">
                Error ID: {error.digest}
              </p>
            )}

            {/* Actions */}
            <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <button
                onClick={reset}
                className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg bg-primary px-5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
              >
                Try Again
              </button>
              <Link
                href="/"
                className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg border border-border bg-background px-5 text-sm font-medium transition-colors hover:bg-muted"
              >
                Go Home
              </Link>
            </div>
          </div>
        </div>
      </body>
    </html>
  );
}
