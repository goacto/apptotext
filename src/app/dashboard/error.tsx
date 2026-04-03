"use client";

import Link from "next/link";
import { AlertTriangle, Home, RotateCcw } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex min-h-[calc(100vh-8rem)] items-center justify-center px-4">
      <Card className="w-full max-w-md">
        <CardHeader className="items-center text-center">
          <div className="mb-2 flex size-12 items-center justify-center rounded-full bg-destructive/10">
            <AlertTriangle className="size-6 text-destructive" />
          </div>
          <CardTitle className="text-lg">Dashboard Unavailable</CardTitle>
          <CardDescription>
            {error.message ||
              "An error occurred while loading the dashboard. Please try again."}
          </CardDescription>
          {error.digest && (
            <p className="mt-1 text-[11px] text-muted-foreground/60">
              Error ID: {error.digest}
            </p>
          )}
        </CardHeader>
        <CardContent className="text-center">
          <p className="text-sm text-muted-foreground">
            This is usually a temporary issue. If the problem continues, please
            try signing out and back in.
          </p>
        </CardContent>
        <CardFooter className="justify-center gap-3">
          <Button onClick={reset} className="gap-1.5">
            <RotateCcw className="size-4" />
            Try Again
          </Button>
          <Link href="/">
            <Button variant="outline" className="gap-1.5">
              <Home className="size-4" />
              Go Home
            </Button>
          </Link>
        </CardFooter>
      </Card>
    </div>
  );
}
