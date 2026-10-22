import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { getStripe } from "@/lib/stripe";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendEmail } from "@/lib/email";
import { subscriptionWelcomeEmail } from "@/lib/email/templates";
import { PAID_PLANS } from "@/lib/plans";

export async function POST(request: NextRequest) {
  const body = await request.text();
  const signature = request.headers.get("stripe-signature");

  if (!signature) {
    return NextResponse.json(
      { error: "Missing stripe-signature header" },
      { status: 400 }
    );
  }

  let event: Stripe.Event;

  try {
    event = getStripe().webhooks.constructEvent(
      body,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET!.trim()
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Webhook verification failed";
    console.error("Webhook signature verification failed:", message);
    return NextResponse.json({ error: message }, { status: 400 });
  }

  const supabase = createAdminClient();

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        const userId = session.metadata?.user_id;
        const plan = session.metadata?.plan ?? "pro";

        // Validate plan tier
        const validPlans = ["standard", "pro", "master"];
        const subscriptionStatus = validPlans.includes(plan) ? plan : "pro";

        if (userId && session.subscription) {
          const subscriptionId =
            typeof session.subscription === "string" ? session.subscription : session.subscription.id;
          // Read before writing so a retried webhook for the same subscription sends no second email.
          const { data: before } = await supabase
            .from("profiles")
            .select("stripe_subscription_id, email")
            .eq("id", userId)
            .maybeSingle();
          await supabase
            .from("profiles")
            .update({
              subscription_status: subscriptionStatus,
              stripe_subscription_id:
                typeof session.subscription === "string"
                  ? session.subscription
                  : session.subscription.id,
              stripe_customer_id:
                typeof session.customer === "string"
                  ? session.customer
                  : session.customer?.id ?? null,
            })
            .eq("id", userId);

          // Welcome email: a no-op log unless RESEND_API_KEY and EMAIL_FROM are set in production.
          const to = session.customer_details?.email ?? (before?.email as string | undefined);
          const planInfo = PAID_PLANS.find((p) => p.id === subscriptionStatus);
          if (to && planInfo && before?.stripe_subscription_id !== subscriptionId) {
            const mail = subscriptionWelcomeEmail(planInfo.name, planInfo.priceCents, planInfo.limit);
            const sent = await sendEmail({ to, ...mail });
            if (sent.error) console.error("welcome email failed", sent.error);
          }
        }
        break;
      }

      case "customer.subscription.updated": {
        const subscription = event.data.object as Stripe.Subscription;
        const customerId =
          typeof subscription.customer === "string"
            ? subscription.customer
            : subscription.customer.id;

        const status = subscription.status;

        if (status === "active" || status === "trialing") {
          // Keep existing subscription_status (standard/pro/master) — don't change tier on renewal
          // Only downgrade to free if subscription is no longer active
        } else {
          await supabase
            .from("profiles")
            .update({ subscription_status: "free", generation_limit_override: null, grandfathered_plan: null })
            .eq("stripe_customer_id", customerId);
        }
        break;
      }

      case "customer.subscription.deleted": {
        const subscription = event.data.object as Stripe.Subscription;
        const customerId =
          typeof subscription.customer === "string"
            ? subscription.customer
            : subscription.customer.id;

        await supabase
          .from("profiles")
          .update({
            subscription_status: "free",
            stripe_subscription_id: null,
            // Grandfathered limits end when the subscription ends.
            generation_limit_override: null,
            grandfathered_plan: null,
          })
          .eq("stripe_customer_id", customerId);
        break;
      }

      case "invoice.payment_succeeded": {
        const invoice = event.data.object as Stripe.Invoice;
        const customerId =
          typeof invoice.customer === "string"
            ? invoice.customer
            : invoice.customer?.id ?? null;

        // Only reset on subscription renewals, not the first payment
        if (customerId && invoice.billing_reason === "subscription_cycle") {
          await supabase
            .from("profiles")
            .update({
              generation_count: 0,
              generation_reset_at: new Date().toISOString(),
            })
            .eq("stripe_customer_id", customerId);
        }
        break;
      }
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error("Webhook handler error:", error);
    return NextResponse.json(
      { error: "Webhook handler failed" },
      { status: 500 }
    );
  }
}
