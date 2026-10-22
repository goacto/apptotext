import { getStripe } from "@/lib/stripe";

/** True when a billing portal configuration exists (it is created in the Stripe Dashboard). */
export async function portalConfigured(stripe: Pick<ReturnType<typeof getStripe>, "billingPortal"> = getStripe()): Promise<boolean> {
  try {
    const list = await stripe.billingPortal.configurations.list({ limit: 1, active: true });
    return list.data.length > 0;
  } catch {
    return false;
  }
}

