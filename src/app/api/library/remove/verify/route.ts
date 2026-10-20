import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { fetchRepoMeta, publicToken } from "@/lib/github/api";
import { appendEvent, checkOwnership, takedown, type RemovalType } from "@/lib/cache/removal";
import { durableRateLimit } from "@/lib/limits";

/**
 * FR-7.2 (a)/(b): "Verify now". Needs the request id and its token (only the requester has both).
 * On success the takedown runs immediately (FR-7.3: verified -> withdrawn well within 1 hour).
 */
export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => ({}))) as { request_id?: string; token?: string };
  if (!body.request_id || !body.token) return NextResponse.json({ error: "request_id and token are required" }, { status: 400 });

  const allowed = await durableRateLimit(createAdminClient(), `removal-verify:${body.request_id}`, 10, 3_600_000);
  if (!allowed) return NextResponse.json({ error: "Too many attempts. Please wait a few minutes." }, { status: 429 });

  const admin = createAdminClient();
  const { data: req } = await admin
    .from("removal_requests")
    .select("id, repo_key, github_repo_id, type, email, verify_token, status")
    .eq("id", body.request_id)
    .maybeSingle();
  if (!req || req.verify_token !== body.token) return NextResponse.json({ error: "Request not found" }, { status: 404 });
  if (req.status === "closed") return NextResponse.json({ status: "closed", verified: true });
  if (req.type === "report") {
    return NextResponse.json({ status: req.status, verified: false, message: "We review problem reports by hand within 2 business days." });
  }

  const [owner, name] = String(req.repo_key).split("/");
  const meta = await fetchRepoMeta(owner, name, publicToken()).catch(() => null);
  if (!meta) {
    await appendEvent(admin, req.id as string, "verify_failed", { why: "repo_unavailable" });
    return NextResponse.json({
      status: req.status,
      verified: false,
      message: "We couldn't read this repository on GitHub right now. We'll review it by hand.",
    });
  }
  if (!req.github_repo_id) await admin.from("removal_requests").update({ github_repo_id: meta.github_repo_id }).eq("id", req.id);

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const method = await checkOwnership(meta, req.verify_token as string, user);
  if (!method) {
    await appendEvent(admin, req.id as string, "verify_attempt", { result: "not_yet" });
    return NextResponse.json({
      status: req.status,
      verified: false,
      message: "We couldn't verify ownership yet. Sign in with GitHub as the owner, add the topic, or commit the file, then try again.",
    });
  }
  const result = await takedown(
    admin,
    {
      id: req.id as string,
      repo_key: meta.repo_key,
      github_repo_id: meta.github_repo_id,
      type: req.type as RemovalType,
      email: req.email as string,
    },
    method,
    meta.owner
  );
  return NextResponse.json({ status: "closed", verified: true, method, withdrawn: result.withdrawn });
}
