import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getStripe } from "@/lib/stripe";
import { planFromStatus } from "@/lib/subscription";
import { PlanChangeError, changePlan, isPaidPlan } from "@/lib/plan-change";

export const maxDuration = 30;

/** POST { plan }: switch a subscribed user's tier in place (see src/lib/plan-change.ts). */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) return NextResponse.json({ error: "Authentication required" }, { status: 401 });

    const body = await request.json().catch(() => null);
    const target = body?.plan;
    if (!isPaidPlan(target)) return NextResponse.json({ error: "Pick Standard, Pro or Master." }, { status: 400 });

    const { data: profile } = await supabase
      .from("profiles")
      .select("subscription_status, stripe_subscription_id, stripe_customer_id")
      .eq("id", user.id)
      .single();
    if (!profile?.stripe_subscription_id || !profile.stripe_customer_id) {
      return NextResponse.json(
        { error: "You don't have a subscription yet. Pick a plan on the Pricing page.", code: "no_subscription" },
        { status: 409 }
      );
    }

    const result = await changePlan(getStripe(), {
      subscriptionId: profile.stripe_subscription_id,
      customerId: profile.stripe_customer_id,
      target,
      profilePlan: planFromStatus(profile.subscription_status),
    });

    // Changes take effect now; the webhook writes the same value again (idempotent).
    await createAdminClient()
      .from("profiles")
      .update({ subscription_status: result.plan })
      .eq("id", user.id)
      .eq("stripe_subscription_id", profile.stripe_subscription_id);
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    if (error instanceof PlanChangeError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    console.error("Plan change error:", error);
    return NextResponse.json({ error: "We couldn't change your plan. Nothing was charged." }, { status: 500 });
  }
}
