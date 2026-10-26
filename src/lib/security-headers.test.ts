import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  contentSecurityPolicyReportOnly,
  enforcingContentSecurityPolicy,
  securityHeaders,
} from "./security-headers";

describe("security headers", () => {
  const headers = securityHeaders({ nodeEnv: "production", supabaseUrl: "https://example.supabase.co" });
  const byName = Object.fromEntries(headers.map((h) => [h.key, h.value]));

  it("sends the clickjacking and baseline headers", () => {
    expect(byName["X-Frame-Options"]).toBe("DENY");
    expect(byName["Content-Security-Policy"]).toBe("frame-ancestors 'none'");
    expect(byName["Referrer-Policy"]).toBe("strict-origin-when-cross-origin");
    expect(byName["X-Content-Type-Options"]).toBe("nosniff");
    expect(byName["Permissions-Policy"]).toContain("camera=()");
    expect(byName["Permissions-Policy"]).toContain("microphone=()");
    expect(byName["Permissions-Policy"]).toContain("geolocation=()");
    expect(byName["Permissions-Policy"]).toContain("payment=()");
  });

  it("keeps the enforcing CSP to frame-ancestors so the rest of the app is not blocked", () => {
    expect(enforcingContentSecurityPolicy()).toBe("frame-ancestors 'none'");
    expect(enforcingContentSecurityPolicy()).not.toContain("script-src");
  });

  it("report-only policy matches Supabase, Stripe, the usage ping, and avatars", () => {
    const csp = contentSecurityPolicyReportOnly({
      nodeEnv: "production",
      supabaseUrl: "https://example.supabase.co",
    });
    expect(byName["Content-Security-Policy-Report-Only"]).toBe(csp);
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("https://*.supabase.co");
    expect(csp).toContain("wss://*.supabase.co");
    expect(csp).toContain("https://example.supabase.co");
    expect(csp).toContain("wss://example.supabase.co");
    expect(csp).toContain("https://api.stripe.com");
    expect(csp).toContain("https://checkout.stripe.com");
    expect(csp).toContain("https://billing.stripe.com");
    expect(csp).toContain("https://siagentspace.com");
    expect(csp).toContain("https://*.googleusercontent.com");
    expect(csp).toContain("https://avatars.githubusercontent.com");
    expect(csp).toContain("script-src 'self' 'unsafe-inline'");
    expect(csp).not.toContain("unsafe-eval");
    expect(csp).not.toContain("\n");
  });

  it("allows eval only in the development report-only policy", () => {
    const csp = contentSecurityPolicyReportOnly({ nodeEnv: "development" });
    expect(csp).toContain("'unsafe-eval'");
  });

  it("is wired from next.config for every path", () => {
    const src = readFileSync(join(process.cwd(), "next.config.ts"), "utf8");
    expect(src).toContain('source: "/(.*)"');
    expect(src).toContain("securityHeaders()");
  });
});
