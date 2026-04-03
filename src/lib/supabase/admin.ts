import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL ||
  "https://uwsvqzartbukejiivvlg.supabase.co";

/**
 * Creates a Supabase admin client using the service role key.
 * Use this ONLY in server-side contexts that don't have user auth
 * (e.g., Stripe webhooks). This client bypasses Row Level Security.
 */
export function createAdminClient() {
  return createClient(SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY!);
}
