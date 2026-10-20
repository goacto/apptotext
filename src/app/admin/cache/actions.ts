"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireOwner } from "@/lib/admin/owner";
import { appendEvent, takedown, type RemovalType } from "@/lib/cache/removal";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function idFrom(form: FormData): string | null {
  const id = String(form.get("id") ?? "");
  return UUID.test(id) ? id : null;
}

/** Approve = manual verification -> the same takedown path as a verified owner (FR-7.4). */
export async function approveRequest(form: FormData) {
  const user = await requireOwner();
  const id = idFrom(form);
  if (!id) return;
  const admin = createAdminClient();
  const { data: req } = await admin
    .from("removal_requests")
    .select("id, repo_key, github_repo_id, type, email, status")
    .eq("id", id)
    .maybeSingle();
  if (!req || !["pending", "need_info"].includes(req.status as string)) return;
  await appendEvent(admin, id, "owner_approved", { by: user.email });
  await takedown(
    admin,
    {
      id,
      repo_key: req.repo_key as string,
      github_repo_id: (req.github_repo_id as number | null) ?? null,
      type: req.type as RemovalType,
      email: req.email as string,
    },
    "manual",
    (req.repo_key as string).split("/")[0] ?? null
  );
  revalidatePath("/admin/cache");
}

async function setStatus(form: FormData, status: "rejected" | "need_info") {
  const user = await requireOwner();
  const id = idFrom(form);
  if (!id) return;
  const admin = createAdminClient();
  await admin
    .from("removal_requests")
    .update({ status, resolved_at: status === "rejected" ? new Date().toISOString() : null })
    .eq("id", id)
    .in("status", ["pending", "need_info"]);
  await appendEvent(admin, id, `owner_${status}`, { by: user.email });
  revalidatePath("/admin/cache");
}

export async function rejectRequest(form: FormData) {
  await setStatus(form, "rejected");
}

export async function needInfoRequest(form: FormData) {
  await setStatus(form, "need_info");
}

/** Removing a do-not-cache entry only allows future caching; nothing is restored automatically. */
export async function removeDoNotCache(form: FormData) {
  await requireOwner();
  const id = idFrom(form);
  if (!id) return;
  await createAdminClient().from("do_not_cache").delete().eq("id", id);
  revalidatePath("/admin/cache");
}
