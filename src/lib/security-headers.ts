/**
 * Response headers for every route.
 *
 * Clickjacking is enforced (X-Frame-Options and a CSP that only sets
 * frame-ancestors). The broader Content-Security-Policy-Report-Only policy
 * matches what the browser actually loads and does not block yet:
 * - Next.js (self scripts/styles, inline bootstrap and Tailwind)
 * - next/font (self; Geist is not loaded from Google at runtime)
 * - Supabase auth/rest (and realtime websocket) on *.supabase.co
 * - Stripe Checkout / Customer Portal (top-level navigation and possible frames)
 * - GOACTO usage ping (https://siagentspace.com/api/ping)
 * - OAuth avatars (Google, GitHub). Sign-in itself is a top-level navigation.
 */

export interface HeaderEnv {
  nodeEnv?: string;
  supabaseUrl?: string;
}

const PERMISSIONS_POLICY = [
  "accelerometer=()",
  "camera=()",
  "display-capture=()",
  "geolocation=()",
  "gyroscope=()",
  "magnetometer=()",
  "microphone=()",
  "payment=()",
  "usb=()",
  "interest-cohort=()",
].join(", ");

export function enforcingContentSecurityPolicy(): string {
  return "frame-ancestors 'none'";
}

export function contentSecurityPolicyReportOnly(env: HeaderEnv = {}): string {
  const nodeEnv = env.nodeEnv ?? process.env.NODE_ENV;
  const supabaseUrl = env.supabaseUrl ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const scriptSrc = ["'self'", "'unsafe-inline'"];
  if (nodeEnv === "development") scriptSrc.push("'unsafe-eval'");

  const connect = new Set<string>([
    "'self'",
    "https://*.supabase.co",
    "wss://*.supabase.co",
    "https://siagentspace.com",
    "https://api.stripe.com",
  ]);
  if (supabaseUrl) {
    try {
      const host = new URL(supabaseUrl).host;
      connect.add(`https://${host}`);
      connect.add(`wss://${host}`);
    } catch {
      // A missing or unparsable public URL still allows the *.supabase.co wildcard.
    }
  }

  return [
    "default-src 'self'",
    `script-src ${scriptSrc.join(" ")}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' blob: data: https://*.googleusercontent.com https://avatars.githubusercontent.com https://*.supabase.co",
    "font-src 'self'",
    `connect-src ${[...connect].join(" ")}`,
    "frame-src https://checkout.stripe.com https://billing.stripe.com https://js.stripe.com https://hooks.stripe.com",
    "form-action 'self' https://checkout.stripe.com https://billing.stripe.com",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "object-src 'none'",
    "upgrade-insecure-requests",
  ].join("; ");
}

export function securityHeaders(env?: HeaderEnv): { key: string; value: string }[] {
  return [
    { key: "X-Frame-Options", value: "DENY" },
    { key: "Content-Security-Policy", value: enforcingContentSecurityPolicy() },
    { key: "Content-Security-Policy-Report-Only", value: contentSecurityPolicyReportOnly(env) },
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    { key: "Permissions-Policy", value: PERMISSIONS_POLICY },
    { key: "X-Content-Type-Options", value: "nosniff" },
  ];
}
