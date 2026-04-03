"use client";

import React from "react";
import Link from "next/link";
import { AlertTriangle } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

interface ErrorBoundaryProps {
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

function sanitizeErrorMessage(message: string): string {
  // Strip potential sensitive info like file paths, stack traces, and tokens
  const sanitized = message
    .replace(/\/[^\s]+/g, "[path]")
    .replace(/at\s+.+\(.+\)/g, "")
    .replace(/[A-Za-z0-9+/=]{40,}/g, "[redacted]")
    .trim();
  // Cap the length to something user-friendly
  return sanitized.length > 200 ? `${sanitized.slice(0, 200)}...` : sanitized;
}

class ErrorBoundary extends React.Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error("ErrorBoundary caught an error:", error, errorInfo);
  }

  reset = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      const errorMessage = this.state.error?.message
        ? sanitizeErrorMessage(this.state.error.message)
        : null;

      return (
        <div className="flex min-h-[400px] items-center justify-center px-4">
          <Card className="w-full max-w-md">
            <CardHeader className="items-center text-center">
              <div className="mb-2 flex size-12 items-center justify-center rounded-full bg-destructive/10">
                <AlertTriangle className="size-6 text-destructive" />
              </div>
              <CardTitle className="text-lg">Something went wrong</CardTitle>
            </CardHeader>
            <CardContent className="text-center">
              {errorMessage && (
                <p className="text-sm text-muted-foreground">{errorMessage}</p>
              )}
              {!errorMessage && (
                <p className="text-sm text-muted-foreground">
                  An unexpected error occurred. Please try again or return to the
                  dashboard.
                </p>
              )}
            </CardContent>
            <CardFooter className="justify-center gap-3">
              <Button onClick={this.reset}>Try Again</Button>
              <Link href="/dashboard">
                <Button variant="outline">Go to Dashboard</Button>
              </Link>
            </CardFooter>
          </Card>
        </div>
      );
    }

    return this.props.children;
  }
}

export { ErrorBoundary };
