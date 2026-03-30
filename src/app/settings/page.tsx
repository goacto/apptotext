"use client";

import { useCallback, useEffect, useState } from "react";
import {
  AlertTriangle,
  Loader2,
  Monitor,
  Moon,
  Save,
  Shield,
  Sun,
  Zap,
} from "lucide-react";

import { createClient } from "@/lib/supabase/client";
import { AI_PROVIDERS } from "@/lib/constants";
import type { AIProvider } from "@/lib/types";
import { AuthGuard, useAuth } from "@/components/auth/auth-guard";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

type Theme = "light" | "dark" | "system";

function getInitialTheme(): Theme {
  if (typeof window === "undefined") return "system";
  const stored = localStorage.getItem("apptotext-theme");
  if (stored === "light" || stored === "dark" || stored === "system") {
    return stored;
  }
  return "system";
}

function applyTheme(theme: Theme) {
  if (typeof window === "undefined") return;
  const root = document.documentElement;
  if (theme === "dark") {
    root.classList.add("dark");
  } else if (theme === "light") {
    root.classList.remove("dark");
  } else {
    // System preference
    const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    if (prefersDark) {
      root.classList.add("dark");
    } else {
      root.classList.remove("dark");
    }
  }
  localStorage.setItem("apptotext-theme", theme);
}

function SettingsContent() {
  const { user } = useAuth();
  const supabase = createClient();

  const [preferredProvider, setPreferredProvider] = useState<AIProvider>("claude");
  const [theme, setTheme] = useState<Theme>("system");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  // Password change state
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isChangingPassword, setIsChangingPassword] = useState(false);
  const [passwordMessage, setPasswordMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  // Delete account state
  const [deleteConfirmation, setDeleteConfirmation] = useState("");
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);

  const fetchSettings = useCallback(async () => {
    try {
      const { data: profileData } = await supabase
        .from("profiles")
        .select("preferred_ai_provider")
        .eq("id", user.id)
        .single();

      if (profileData?.preferred_ai_provider) {
        setPreferredProvider(profileData.preferred_ai_provider as AIProvider);
      }

      setTheme(getInitialTheme());
    } catch (error) {
      console.error("Failed to fetch settings:", error);
    } finally {
      setIsLoading(false);
    }
  }, [supabase, user.id]);

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  // Listen for system theme changes when in "system" mode
  useEffect(() => {
    if (theme !== "system") return;

    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    function handleChange() {
      applyTheme("system");
    }
    mediaQuery.addEventListener("change", handleChange);
    return () => mediaQuery.removeEventListener("change", handleChange);
  }, [theme]);

  function handleThemeChange(newTheme: Theme) {
    setTheme(newTheme);
    applyTheme(newTheme);
  }

  async function handleSaveSettings() {
    if (isSaving) return;
    setIsSaving(true);
    setSaveMessage(null);

    try {
      const { error } = await supabase
        .from("profiles")
        .update({ preferred_ai_provider: preferredProvider })
        .eq("id", user.id);

      if (error) {
        setSaveMessage({
          type: "error",
          text: "Failed to save settings. Please try again.",
        });
      } else {
        setSaveMessage({
          type: "success",
          text: "Settings saved successfully.",
        });
      }
    } catch {
      setSaveMessage({
        type: "error",
        text: "An unexpected error occurred.",
      });
    } finally {
      setIsSaving(false);
    }
  }

  async function handleChangePassword() {
    if (isChangingPassword) return;

    setPasswordMessage(null);

    if (newPassword.length < 8) {
      setPasswordMessage({
        type: "error",
        text: "Password must be at least 8 characters long.",
      });
      return;
    }

    if (newPassword !== confirmPassword) {
      setPasswordMessage({
        type: "error",
        text: "Passwords do not match.",
      });
      return;
    }

    setIsChangingPassword(true);

    try {
      const { error } = await supabase.auth.updateUser({
        password: newPassword,
      });

      if (error) {
        setPasswordMessage({
          type: "error",
          text: error.message || "Failed to change password.",
        });
      } else {
        setPasswordMessage({
          type: "success",
          text: "Password changed successfully.",
        });
        setNewPassword("");
        setConfirmPassword("");
      }
    } catch {
      setPasswordMessage({
        type: "error",
        text: "An unexpected error occurred.",
      });
    } finally {
      setIsChangingPassword(false);
    }
  }

  async function handleDeleteAccount() {
    if (isDeleting) return;
    setIsDeleting(true);

    try {
      // Call a server-side endpoint or edge function for account deletion
      // since client-side Supabase cannot delete users directly.
      const response = await fetch("/api/account/delete", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
      });

      if (!response.ok) {
        throw new Error("Failed to delete account");
      }

      await supabase.auth.signOut();
      window.location.href = "/";
    } catch (error) {
      console.error("Failed to delete account:", error);
      setIsDeleting(false);
      setDeleteDialogOpen(false);
    }
  }

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="size-8 animate-spin text-muted-foreground" />
          <p className="text-sm text-muted-foreground">Loading settings...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-8 px-4 py-8 sm:px-6 lg:px-8">
      {/* Page Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
          Settings
        </h1>
        <p className="text-muted-foreground">
          Customize your experience and manage your account.
        </p>
      </div>

      {/* AI Provider */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Zap className="size-4" />
            AI Provider
          </CardTitle>
          <CardDescription>
            Choose your preferred AI provider for generating textbooks, flashcards, and quizzes.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Preferred Provider</Label>
            <Select
              value={preferredProvider}
              onValueChange={(val) => setPreferredProvider(val as AIProvider)}
            >
              <SelectTrigger className="w-full sm:w-64">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {AI_PROVIDERS.map((provider) => (
                  <SelectItem key={provider.id} value={provider.id}>
                    {provider.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              {AI_PROVIDERS.find((p) => p.id === preferredProvider)?.description}
            </p>
          </div>

          <div className="flex items-center gap-3">
            <Button onClick={handleSaveSettings} disabled={isSaving}>
              {isSaving ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <Save className="size-4" />
                  Save Settings
                </>
              )}
            </Button>
            {saveMessage && (
              <p
                className={`text-sm ${
                  saveMessage.type === "success"
                    ? "text-green-600 dark:text-green-400"
                    : "text-destructive"
                }`}
              >
                {saveMessage.text}
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Appearance */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Sun className="size-4" />
            Appearance
          </CardTitle>
          <CardDescription>
            Choose how AppToText looks to you. Select a light or dark theme, or follow your system preference.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-3">
            {([
              { value: "light" as const, label: "Light", Icon: Sun },
              { value: "dark" as const, label: "Dark", Icon: Moon },
              { value: "system" as const, label: "System", Icon: Monitor },
            ]).map(({ value, label, Icon }) => (
              <button
                key={value}
                onClick={() => handleThemeChange(value)}
                className={`flex flex-col items-center gap-2 rounded-lg border-2 p-4 transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${
                  theme === value
                    ? "border-primary bg-primary/5"
                    : "border-transparent hover:border-muted-foreground/25"
                }`}
              >
                <Icon
                  className={`size-6 ${
                    theme === value ? "text-primary" : "text-muted-foreground"
                  }`}
                />
                <span
                  className={`text-sm font-medium ${
                    theme === value ? "text-primary" : "text-muted-foreground"
                  }`}
                >
                  {label}
                </span>
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Account */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="size-4" />
            Account
          </CardTitle>
          <CardDescription>
            Manage your password and account settings.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Change Password */}
          <div className="space-y-4">
            <h3 className="text-sm font-medium">Change Password</h3>
            <div className="space-y-3">
              <div className="space-y-2">
                <Label htmlFor="new-password">New Password</Label>
                <Input
                  id="new-password"
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Enter new password"
                  minLength={8}
                  className="max-w-sm"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirm-password">Confirm Password</Label>
                <Input
                  id="confirm-password"
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Confirm new password"
                  minLength={8}
                  className="max-w-sm"
                />
              </div>
              <div className="flex items-center gap-3">
                <Button
                  onClick={handleChangePassword}
                  disabled={isChangingPassword || !newPassword || !confirmPassword}
                  variant="outline"
                >
                  {isChangingPassword ? (
                    <>
                      <Loader2 className="size-4 animate-spin" />
                      Changing...
                    </>
                  ) : (
                    "Change Password"
                  )}
                </Button>
                {passwordMessage && (
                  <p
                    className={`text-sm ${
                      passwordMessage.type === "success"
                        ? "text-green-600 dark:text-green-400"
                        : "text-destructive"
                    }`}
                  >
                    {passwordMessage.text}
                  </p>
                )}
              </div>
            </div>
          </div>

          <Separator />

          {/* Danger Zone */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <AlertTriangle className="size-4 text-destructive" />
              <h3 className="text-sm font-medium text-destructive">
                Danger Zone
              </h3>
            </div>
            <p className="text-sm text-muted-foreground">
              Permanently delete your account and all associated data. This action
              cannot be undone.
            </p>
            <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
              <DialogTrigger
                render={
                  <Button variant="outline" className="border-destructive text-destructive hover:bg-destructive hover:text-destructive-foreground" />
                }
              >
                Delete Account
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Delete Account</DialogTitle>
                  <DialogDescription>
                    This will permanently delete your account, all conversions,
                    progress, and badges. This action cannot be undone.
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-3 py-2">
                  <Label htmlFor="delete-confirmation">
                    Type <span className="font-mono font-bold">DELETE</span> to
                    confirm
                  </Label>
                  <Input
                    id="delete-confirmation"
                    value={deleteConfirmation}
                    onChange={(e) => setDeleteConfirmation(e.target.value)}
                    placeholder="DELETE"
                  />
                </div>
                <DialogFooter>
                  <DialogClose
                    render={<Button variant="outline" />}
                  >
                    Cancel
                  </DialogClose>
                  <Button
                    variant="destructive"
                    onClick={handleDeleteAccount}
                    disabled={deleteConfirmation !== "DELETE" || isDeleting}
                  >
                    {isDeleting ? (
                      <>
                        <Loader2 className="size-4 animate-spin" />
                        Deleting...
                      </>
                    ) : (
                      "Permanently Delete"
                    )}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export default function SettingsPage() {
  return (
    <AuthGuard>
      <SettingsContent />
    </AuthGuard>
  );
}
