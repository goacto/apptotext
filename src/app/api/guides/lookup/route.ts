import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { lookupCache } from "@/lib/cache/guides";

/** FR-2.1 for an existing conversion: which levels are instant, and from which commit. */
export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  const conversionId = request.nextUrl.searchParams.get("conversion_id");
  if (!conversionId) return NextResponse.json({ error: "conversion_id is required" }, { status: 400 });
  const { data: conv } = await supabase
    .from("conversions")
    .select("repo_key, commit_sha")
    .eq("id", conversionId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!conv?.repo_key) return NextResponse.json({ cache: {} });
  const cache = await lookupCache(createAdminClient(), conv.repo_key as string, (conv.commit_sha as string | null) ?? null);
  return NextResponse.json({ cache, commit_sha: conv.commit_sha });
}
