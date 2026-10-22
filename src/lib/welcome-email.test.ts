import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { getEmailProvider, sendEmail } from "./email";
import { subscriptionWelcomeEmail } from "./email/templates";

const read = (f: string) => readFileSync(join(process.cwd(), f), "utf8");

describe("subscription welcome email", () => {
  it("uses the plan's existing price and limit, says 'we', names no person", () => {
    const m = subscriptionWelcomeEmail("Pro", 999, 6);
    expect(m.subject).toBe("Welcome to AppToText Pro");
    expect(m.text).toContain("$9.99/month");
    expect(m.text).toContain("6 guide generations per month");
    expect(m.text).not.toMatch(/zach|etched/i);
  });
  it("is a log-only no-op when RESEND_API_KEY is unset, even in production", async () => {
    expect(getEmailProvider({ VERCEL_ENV: "production", EMAIL_FROM: "a@b.co" }).name).toBe("log");
    expect(getEmailProvider({ VERCEL_ENV: "preview", RESEND_API_KEY: "k", EMAIL_FROM: "a@b.co" }).name).toBe("log");
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const r = await sendEmail({ to: "someone@gmail.com", ...subscriptionWelcomeEmail("Pro", 999, 6) }, getEmailProvider({}));
    expect(r).toEqual({ delivered: false, provider: "log" });
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });
  it("webhook sends it once per new subscription on checkout.session.completed", () => {
    const src = read("src/app/api/stripe/webhook/route.ts");
    const block = src.slice(src.indexOf('case "checkout.session.completed"'), src.indexOf('case "customer.subscription.updated"'));
    expect(block).toContain("subscriptionWelcomeEmail(");
    expect(block).toContain("before?.stripe_subscription_id !== subscriptionId");
    expect(src.match(/sendEmail\(/g)?.length).toBe(1);
  });
});
