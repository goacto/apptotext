import type { Metadata } from "next";
import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/admin";
import { daysAgoIso, requireOwner, windowMetrics, type LedgerLite } from "@/lib/admin/owner";
import { dailyCapUsd } from "@/lib/limits";
import { approveRequest, needInfoRequest, rejectRequest, removeDoNotCache } from "./actions";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Cache admin", robots: { index: false, follow: false } };

const TABS = ["requests", "dnc", "withdrawn"] as const;
type Tab = (typeof TABS)[number];
const usd = (n: number) => `$${n.toFixed(2)}`;
const when = (s: string | null) => (s ? new Date(s).toLocaleString("en-US", { timeZone: "America/New_York" }) + " ET" : "-");

export default async function CacheAdminPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  await requireOwner();
  const { tab: rawTab } = await searchParams;
  const tab: Tab = TABS.includes(rawTab as Tab) ? (rawTab as Tab) : "requests";
  const admin = createAdminClient();

  const since = daysAgoIso(90);
  const [{ data: ledger }, { data: spend }, { count: readyCount }] = await Promise.all([
    admin.from("generations").select("created_at, outcome, cost_usd").gte("created_at", since).limit(50_000),
    admin.rpc("ai_spend_today_et"),
    admin.from("guide_versions").select("id", { count: "exact", head: true }).eq("status", "ready"),
  ]);
  const rows = (ledger ?? []) as LedgerLite[];
  const metrics = [7, 30, 90].map((d) => windowMetrics(rows, d));
  const cap = dailyCapUsd();

  return (
    <main className="mx-auto max-w-6xl space-y-8 px-4 py-10">
      <h1 className="text-2xl font-bold">Cache admin</h1>

      <section className="grid gap-4 sm:grid-cols-4">
        <Stat label="AI spend today (ET)" value={`${usd(Number(spend ?? 0))} / ${usd(cap)}`} />
        <Stat label="Ready shared guides" value={String(readyCount ?? 0)} />
        <Stat label="Cache hit rate (30d)" value={metrics[1].hitRate == null ? "-" : `${Math.round(metrics[1].hitRate * 100)}%`} />
        <Stat label="Est. saved (30d)" value={`${usd(metrics[1].savedUsdLow)}-${usd(metrics[1].savedUsdHigh)}`} />
      </section>

      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-muted-foreground">
            <th>Window</th><th>Generated</th><th>Cache hits</th><th>Hit rate</th><th>Refused</th><th>Failed/aborted</th><th>AI spend</th><th>Est. saved</th>
          </tr>
        </thead>
        <tbody>
          {metrics.map((m) => (
            <tr key={m.days} className="border-t">
              <td>{m.days}d</td><td>{m.generated}</td><td>{m.cacheHits}</td>
              <td>{m.hitRate == null ? "-" : `${Math.round(m.hitRate * 100)}%`}</td>
              <td>{m.refused}</td><td>{m.failed}</td><td>{usd(m.spentUsd)}</td>
              <td>{usd(m.savedUsdLow)}-{usd(m.savedUsdHigh)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <nav className="flex gap-4 border-b pb-2 text-sm">
        {TABS.map((t) => (
          <Link key={t} href={`/admin/cache?tab=${t}`} className={t === tab ? "font-semibold underline" : "text-muted-foreground"}>
            {t === "requests" ? "Requests" : t === "dnc" ? "Do-not-cache" : "Withdrawn"}
          </Link>
        ))}
      </nav>

      {tab === "requests" && <Requests />}
      {tab === "dnc" && <DoNotCache />}
      {tab === "withdrawn" && <Withdrawn />}
    </main>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border p-4">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-xl font-semibold">{value}</div>
    </div>
  );
}

function Act({ action, id, label }: { action: (f: FormData) => Promise<void>; id: string; label: string }) {
  return (
    <form action={action} className="inline">
      <input type="hidden" name="id" value={id} />
      <button type="submit" className="mr-2 rounded border px-2 py-1 text-xs hover:bg-muted">{label}</button>
    </form>
  );
}

async function Requests() {
  const { data } = await createAdminClient()
    .from("removal_requests")
    .select("id, repo_key, type, email, reason, status, verify_method, created_at")
    .order("created_at", { ascending: false })
    .limit(100);
  if (!data?.length) return <p className="text-sm text-muted-foreground">No removal requests.</p>;
  return (
    <table className="w-full text-sm">
      <thead><tr className="text-left text-muted-foreground"><th>Repo</th><th>Type</th><th>Email</th><th>Reason</th><th>Status</th><th>Created</th><th /></tr></thead>
      <tbody>
        {data.map((r) => (
          <tr key={r.id as string} className="border-t align-top">
            <td>{r.repo_key as string}</td><td>{r.type as string}</td><td>{r.email as string}</td>
            <td className="max-w-xs break-words">{(r.reason as string) ?? ""}</td>
            <td>{r.status as string}{r.verify_method ? ` (${r.verify_method})` : ""}</td>
            <td>{when(r.created_at as string)}</td>
            <td className="whitespace-nowrap">
              {["pending", "need_info"].includes(r.status as string) && (
                <>
                  <Act action={approveRequest} id={r.id as string} label="Approve" />
                  <Act action={rejectRequest} id={r.id as string} label="Reject" />
                  {r.status === "pending" && <Act action={needInfoRequest} id={r.id as string} label="Need info" />}
                </>
              )}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

async function DoNotCache() {
  const { data } = await createAdminClient()
    .from("do_not_cache")
    .select("id, repo_key, github_repo_id, owner, owner_wildcard, reason, created_at")
    .order("created_at", { ascending: false })
    .limit(500);
  if (!data?.length) return <p className="text-sm text-muted-foreground">Do-not-cache list is empty.</p>;
  return (
    <table className="w-full text-sm">
      <thead><tr className="text-left text-muted-foreground"><th>Repo</th><th>GitHub id</th><th>Owner wildcard</th><th>Reason</th><th>Added</th><th /></tr></thead>
      <tbody>
        {data.map((r) => (
          <tr key={r.id as string} className="border-t">
            <td>{r.repo_key as string}</td><td>{String(r.github_repo_id ?? "-")}</td>
            <td>{r.owner_wildcard ? `${r.owner}/*` : "-"}</td><td>{(r.reason as string) ?? ""}</td>
            <td>{when(r.created_at as string)}</td>
            <td><Act action={removeDoNotCache} id={r.id as string} label="Remove" /></td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

async function Withdrawn() {
  const { data } = await createAdminClient()
    .from("guide_versions")
    .select("id, repo_key, level, commit_sha, withdrawn_reason, withdrawn_at")
    .eq("status", "withdrawn")
    .order("withdrawn_at", { ascending: false })
    .limit(200);
  if (!data?.length) return <p className="text-sm text-muted-foreground">No withdrawn guides.</p>;
  return (
    <table className="w-full text-sm">
      <thead><tr className="text-left text-muted-foreground"><th>Repo</th><th>Level</th><th>Commit</th><th>Reason</th><th>Withdrawn</th></tr></thead>
      <tbody>
        {data.map((r) => (
          <tr key={r.id as string} className="border-t">
            <td>{r.repo_key as string}</td><td>{String(r.level)}</td><td>{String(r.commit_sha).slice(0, 7)}</td>
            <td>{(r.withdrawn_reason as string) ?? ""}</td><td>{when(r.withdrawn_at as string)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
