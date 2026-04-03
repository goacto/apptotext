"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { ArrowLeft, Loader2, Mail, CheckCircle } from "lucide-react";

import { createClient } from "@/lib/supabase/client";
import { APP_NAME, GOACTO_SHORT } from "@/lib/constants";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default function ForgotPasswordPage() {
  const supabase = createClient();

  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSent, setIsSent] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    try {
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(
        email,
        {
          redirectTo: `${window.location.origin}/auth/reset-password`,
        }
      );

      if (resetError) {
        setError(resetError.message);
        return;
      }

      setIsSent(true);
    } catch {
      setError("An unexpected error occurred. Please try again.");
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-zinc-50 px-4 dark:bg-black">
      <div className="w-full max-w-md space-y-8">
        {/* Branding */}
        <div className="flex flex-col items-center space-y-2 text-center">
          <div className="flex items-center gap-2">
            <Image src="/logo.svg" alt="AppToText" width={40} height={40} className="rounded-lg" />
            <span className="text-2xl font-bold tracking-tight text-foreground">
              {APP_NAME}
            </span>
          </div>
          <p className="text-sm text-muted-foreground">
            Part of the{" "}
            <span className="font-semibold text-foreground">
              {GOACTO_SHORT}
            </span>{" "}
            ecosystem
          </p>
        </div>

        <Card>
          {isSent ? (
            <>
              <CardHeader className="text-center">
                <div className="mx-auto mb-2 flex size-12 items-center justify-center rounded-full bg-primary/10">
                  <CheckCircle className="size-6 text-primary" />
                </div>
                <CardTitle className="text-lg">Check your email</CardTitle>
                <CardDescription>
                  We sent a password reset link to{" "}
                  <span className="font-medium text-foreground">{email}</span>.
                  Click the link in the email to reset your password.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-center text-xs text-muted-foreground">
                  Didn&apos;t receive the email? Check your spam folder or try
                  again.
                </p>
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={() => {
                    setIsSent(false);
                    setEmail("");
                  }}
                >
                  Send again
                </Button>
              </CardContent>
              <CardFooter className="justify-center">
                <Link
                  href="/auth/login"
                  className="flex items-center gap-1 text-sm font-medium text-primary underline-offset-4 hover:underline"
                >
                  <ArrowLeft className="size-3" />
                  Back to sign in
                </Link>
              </CardFooter>
            </>
          ) : (
            <>
              <CardHeader>
                <CardTitle className="text-lg">Reset your password</CardTitle>
                <CardDescription>
                  Enter the email address associated with your account and
                  we&apos;ll send you a link to reset your password.
                </CardDescription>
              </CardHeader>

              <CardContent>
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="email">Email</Label>
                    <div className="relative">
                      <Mail className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        id="email"
                        type="email"
                        placeholder="you@example.com"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        required
                        disabled={isLoading}
                        className="pl-9"
                      />
                    </div>
                  </div>

                  {error && (
                    <div className="rounded-lg bg-destructive/15 p-3 text-sm font-medium text-destructive">
                      {error}
                    </div>
                  )}

                  <Button
                    type="submit"
                    size="lg"
                    className="w-full"
                    disabled={isLoading}
                  >
                    {isLoading ? (
                      <>
                        <Loader2 className="size-4 animate-spin" />
                        Sending...
                      </>
                    ) : (
                      "Send reset link"
                    )}
                  </Button>
                </form>
              </CardContent>

              <CardFooter className="justify-center">
                <Link
                  href="/auth/login"
                  className="flex items-center gap-1 text-sm font-medium text-primary underline-offset-4 hover:underline"
                >
                  <ArrowLeft className="size-3" />
                  Back to sign in
                </Link>
              </CardFooter>
            </>
          )}
        </Card>
      </div>
    </div>
  );
}
