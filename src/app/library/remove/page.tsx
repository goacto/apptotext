"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

type Created = { request_id: string; verify_token: string; repo_key: string; message: string };

/** FR-7.1 / FR-7.2: removal request form and ownership verification. Copy says "we". */
export default function RemovePage() {
  const [repo, setRepo] = useState("");
  const [type, setType] = useState("remove");
  const [email, setEmail] = useState("");
  const [reason, setReason] = useState("");
  const [website, setWebsite] = useState(""); // honeypot
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<Created | null>(null);
  const [verifyMsg, setVerifyMsg] = useState<string | null>(null);

  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const r = q.get("repo");
    if (r) setRepo(r.includes("github.com") ? r : `https://github.com/${r}`);
    const id = q.get("request");
    const token = q.get("token");
    if (id && token) setCreated({ request_id: id, verify_token: token, repo_key: r ?? "", message: "" });
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/library/remove", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ repo, type, email, reason, website }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error || "Could not send your request.");
      if (data?.request_id) setCreated(data as Created);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not send your request.");
    } finally {
      setBusy(false);
    }
  }

  async function verify() {
    if (!created) return;
    setBusy(true);
    setVerifyMsg(null);
    try {
      const res = await fetch("/api/library/remove/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ request_id: created.request_id, token: created.verify_token }),
      });
      const data = await res.json().catch(() => null);
      setVerifyMsg(
        data?.verified
          ? "Verified. We removed the saved guides for this repository and sent you a confirmation."
          : data?.message || data?.error || "We couldn't verify ownership yet."
      );
    } finally {
      setBusy(false);
    }
  }

  const loginNext = typeof window !== "undefined" ? `${window.location.pathname}${window.location.search}` : "/library/remove";

  return (
    <main className="mx-auto max-w-2xl px-4 py-10">
      <Card>
        <CardHeader>
          <CardTitle>Request removal</CardTitle>
          <CardDescription>
            Own a repository? We can remove its saved guides, or remove them and never cache the repository again.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!created ? (
            <form onSubmit={submit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="repo">Repository URL</Label>
                <Input id="repo" required value={repo} onChange={(e) => setRepo(e.target.value)} placeholder="https://github.com/owner/repo" />
              </div>
              <fieldset className="space-y-2">
                <legend className="text-sm font-medium">Request type</legend>
                {[
                  ["remove", "Remove guides"],
                  ["remove_never", "Remove and never cache again"],
                  ["report", "Report a problem"],
                ].map(([v, label]) => (
                  <label key={v} className="flex items-center gap-2 text-sm">
                    <input type="radio" name="type" value={v} checked={type === v} onChange={() => setType(v)} />
                    {label}
                  </label>
                ))}
              </fieldset>
              <div className="space-y-2">
                <Label htmlFor="email">Contact email</Label>
                <Input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="reason">Reason (optional)</Label>
                <Textarea id="reason" value={reason} onChange={(e) => setReason(e.target.value)} />
              </div>
              <div aria-hidden="true" className="absolute -left-[10000px] h-0 w-0 overflow-hidden">
                <label htmlFor="website">Website</label>
                <input id="website" tabIndex={-1} autoComplete="off" value={website} onChange={(e) => setWebsite(e.target.value)} />
              </div>
              {error && <p className="text-sm text-destructive">{error}</p>}
              <Button type="submit" disabled={busy}>
                {busy && <Loader2 className="size-4 animate-spin" />}
                Send request
              </Button>
            </form>
          ) : (
            <div className="space-y-4 text-sm">
              {created.message && <p>{created.message}</p>}
              <p className="font-medium">Verify ownership with any one of these, then press &quot;Verify now&quot;:</p>
              <ol className="list-decimal space-y-2 pl-5">
                <li>
                  <a className="underline" href={`/auth/login?next=${encodeURIComponent(loginNext)}`}>
                    Sign in with GitHub
                  </a>{" "}
                  as the account that owns the repository.
                </li>
                <li>
                  Add the topic <code>apptotext-optout</code> to the repository.
                </li>
                <li>
                  Commit a file named <code>.apptotext-optout</code> to the default branch containing{" "}
                  <code className="break-all">{created.verify_token}</code>
                </li>
              </ol>
              <p className="text-muted-foreground">
                We also check the topic and file once a day for 7 days. Can&apos;t do any of these? We review requests by hand within 2 business days.
              </p>
              <Button onClick={verify} disabled={busy}>
                {busy && <Loader2 className="size-4 animate-spin" />}
                Verify now
              </Button>
              {verifyMsg && <p role="status">{verifyMsg}</p>}
            </div>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
