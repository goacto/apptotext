import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

/** FR-4.3: waiters poll this every 3 seconds. One indexed read. */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  const { id } = await params;
  const { data } = await createAdminClient()
    .from("guide_versions")
    .select("status, lease_expires_at, ready_at")
    .eq("id", id)
    .maybeSingle();
  if (!data) return NextResponse.json({ error: "Not found" }, { status: 404 });
  let status = data.status as string;
  if (status === "generating" && data.lease_expires_at && new Date(data.lease_expires_at as string).getTime() < Date.now()) {
    status = "stale"; // lease expired: the next requester may take over
  }
  return NextResponse.json({ status, ready_at: data.ready_at });
}
