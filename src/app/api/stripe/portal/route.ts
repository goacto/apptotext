import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getStripe } from "@/lib/stripe";
import { portalConfigured } from "@/lib/stripe-portal";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://apptotext.com";

/** GET: whether to show "Manage billing" (cancel / payment method). */
export async function GET() {
  return NextResponse.json({ available: await portalConfigured() });
}

export async function POST() {
  try {
    const supabase = await createClient();

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401 }
      );
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("stripe_customer_id")
      .eq("id", user.id)
      .single();

    if (!profile?.stripe_customer_id) {
      return NextResponse.json(
        { error: "No billing account found. Please subscribe first." },
        { status: 400 }
      );
    }

    if (!(await portalConfigured())) {
      return NextResponse.json(
        { error: "Billing settings aren't available yet. Plan changes still work on the Pricing page.", code: "portal_unavailable" },
        { status: 503 }
      );
    }

    const session = await getStripe().billingPortal.sessions.create({
      customer: profile.stripe_customer_id,
      return_url: `${APP_URL}/pricing`,
    });

    return NextResponse.json({ url: session.url });
  } catch (error) {
    console.error("Stripe portal error:", error);
    const message =
      error instanceof Error ? error.message : "Failed to create portal session";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
