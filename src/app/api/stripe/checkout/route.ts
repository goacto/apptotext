import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getStripe } from "@/lib/stripe";

export const maxDuration = 30;

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://apptotext.com";

type PlanTier = "standard" | "pro" | "master";

const PLAN_CONFIG: Record<PlanTier, { price: number; name: string; description: string }> = {
  standard: {
    price: 499,
    name: "AppToText Standard",
    description: "10 generations per month, all AI providers",
  },
  pro: {
    price: 999,
    name: "AppToText Pro",
    description: "25 generations per month, all AI providers, priority support",
  },
  master: {
    price: 1499,
    name: "AppToText Master",
    description: "50 generations per month, all AI providers, priority support, early access",
  },
};

export async function POST(request: NextRequest) {
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

    // Parse plan from request body
    let plan: PlanTier = "pro";
    try {
      const body = await request.json();
      if (body.plan && body.plan in PLAN_CONFIG) {
        plan = body.plan as PlanTier;
      }
    } catch {
      // Default to pro if no body or invalid JSON
    }

    const config = PLAN_CONFIG[plan];

    // Get or create Stripe customer
    const { data: profile } = await supabase
      .from("profiles")
      .select("stripe_customer_id, email")
      .eq("id", user.id)
      .single();

    let customerId = profile?.stripe_customer_id;

    if (!customerId) {
      const customer = await getStripe().customers.create({
        email: user.email ?? profile?.email ?? undefined,
        metadata: { user_id: user.id },
      });
      customerId = customer.id;

      await supabase
        .from("profiles")
        .update({ stripe_customer_id: customerId })
        .eq("id", user.id);
    }

    // Create checkout session
    const session = await getStripe().checkout.sessions.create({
      customer: customerId,
      mode: "subscription",
      line_items: [
        {
          price_data: {
            currency: "usd",
            product_data: {
              name: config.name,
              description: config.description,
            },
            unit_amount: config.price,
            recurring: { interval: "month" },
          },
          quantity: 1,
        },
      ],
      metadata: { user_id: user.id, plan },
      success_url: `${APP_URL}/dashboard?upgraded=true`,
      cancel_url: `${APP_URL}/pricing`,
    });

    return NextResponse.json({ url: session.url });
  } catch (error) {
    console.error("Stripe checkout error:", error);
    const message =
      error instanceof Error ? error.message : "Failed to create checkout session";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
