import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { normalizeRepo } from "@/lib/github/normalize";
import { fetchRepoMeta, publicToken } from "@/lib/github/api";
import { sendEmail } from "@/lib/email";
import { removalAckEmail } from "@/lib/email/templates";
import {
  REMOVAL_IP_LIMIT_PER_DAY,
  REMOVAL_TYPES,
  appendEvent,
  hashIp,
  isValidEmail,
  newVerifyToken,
  type RemovalType,
} from "@/lib/cache/removal";

function clientIp(request: NextRequest): string {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "unknown";
}

/** FR-7.1: create a removal request. Honeypot + 5 requests per IP per day (durable: counted in the DB). */
export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;

  // Honeypot: bots fill every field. Pretend success, store nothing.
  if (typeof body.website === "string" && body.website.trim() !== "") {
    return NextResponse.json({ ok: true }, { status: 201 });
  }

  const type = body.type as RemovalType;
  if (!REMOVAL_TYPES.includes(type)) return NextResponse.json({ error: "Choose a request type." }, { status: 400 });
  if (!isValidEmail(body.email)) return NextResponse.json({ error: "Enter a valid contact email." }, { status: 400 });
  const norm = typeof body.repo === "string" ? normalizeRepo(body.repo) : null;
  if (!norm) return NextResponse.json({ error: "Enter a GitHub repository URL like https://github.com/owner/repo." }, { status: 400 });
  const reason = typeof body.reason === "string" ? body.reason.slice(0, 2000) : null;

  const admin = createAdminClient();
  const ipHash = hashIp(clientIp(request));
  const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const { count } = await admin
    .from("removal_requests")
    .select("id", { count: "exact", head: true })
    .eq("ip_hash", ipHash)
    .gte("created_at", since);
  if ((count ?? 0) >= REMOVAL_IP_LIMIT_PER_DAY) {
    return NextResponse.json({ error: "Too many requests today. Please try again tomorrow or email us." }, { status: 429 });
  }

  // Resolve the numeric id so do-not-cache survives renames (FR-7.5). A repo GitHub can't show us is still accepted.
  let githubRepoId: number | null = null;
  let repoKey = norm.repoKey;
  try {
    const meta = await fetchRepoMeta(norm.owner, norm.name, publicToken());
    if (meta) {
      githubRepoId = meta.github_repo_id;
      repoKey = meta.repo_key;
    }
  } catch {
    // rate-limited or down: keep the typed key; verification resolves it later
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const token = newVerifyToken();
  const { data: row, error } = await admin
    .from("removal_requests")
    .insert({
      repo_key: repoKey,
      github_repo_id: githubRepoId,
      type,
      email: String(body.email).trim(),
      reason,
      verify_token: token,
      ip_hash: ipHash,
      requester_user_id: user?.id ?? null,
      events: [{ at: new Date().toISOString(), event: "created" }],
    })
    .select("id")
    .single();
  if (error || !row) return NextResponse.json({ error: "Could not save your request. Please try again." }, { status: 500 });

  const mail = removalAckEmail(repoKey, row.id as string, token);
  const sent = await sendEmail({ to: String(body.email).trim(), ...mail });
  await appendEvent(admin, row.id as string, "ack_email", { provider: sent.provider, delivered: sent.delivered });

  return NextResponse.json(
    {
      ok: true,
      request_id: row.id,
      repo_key: repoKey,
      verify_token: token,
      message: `We received your request for ${repoKey}. We'll confirm within 2 business days, or within 1 hour if you verify ownership below.`,
    },
    { status: 201 }
  );
}
