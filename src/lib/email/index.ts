/**
 * Email behind a provider interface (PR 4). Resend is the first real provider.
 * Unless RESEND_API_KEY and EMAIL_FROM are both set, every send is a no-op that logs
 * (recipient masked, subject, template). Nothing is ever sent from tests or previews.
 */
export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
  template: string;
}

export interface EmailResult {
  delivered: boolean;
  provider: "resend" | "log";
  id?: string;
  error?: string;
}

export interface EmailProvider {
  name: "resend" | "log";
  send(msg: EmailMessage): Promise<EmailResult>;
}

export function maskEmail(email: string): string {
  const [user, domain] = email.split("@");
  if (!domain) return "***";
  return `${user.slice(0, 1)}***@${domain}`;
}

export const logProvider: EmailProvider = {
  name: "log",
  async send(msg) {
    console.log("[email:log-only]", JSON.stringify({ to: maskEmail(msg.to), subject: msg.subject, template: msg.template }));
    return { delivered: false, provider: "log" };
  },
};

export function resendProvider(apiKey: string, from: string, fetchImpl: typeof fetch = fetch): EmailProvider {
  return {
    name: "resend",
    async send(msg) {
      try {
        const res = await fetchImpl("https://api.resend.com/emails", {
          method: "POST",
          headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({ from, to: [msg.to], subject: msg.subject, text: msg.text }),
        });
        const data = (await res.json().catch(() => ({}))) as { id?: string; message?: string };
        if (!res.ok) return { delivered: false, provider: "resend", error: data.message ?? `HTTP ${res.status}` };
        return { delivered: true, provider: "resend", id: data.id };
      } catch (err) {
        return { delivered: false, provider: "resend", error: err instanceof Error ? err.message : "send failed" };
      }
    },
  };
}

/** Real sends only in production with both env vars set, and never to reserved test domains. */
export function getEmailProvider(env: Record<string, string | undefined> = process.env): EmailProvider {
  const key = env.RESEND_API_KEY;
  const from = env.EMAIL_FROM;
  const isProd = env.VERCEL_ENV ? env.VERCEL_ENV === "production" : env.NODE_ENV === "production";
  if (key && from && isProd && env.EMAIL_DRY_RUN !== "1") return resendProvider(key, from);
  return logProvider;
}

const RESERVED = /@(example\.(com|org|net)|[^@]*\.(test|example|invalid|localhost))$/i;

export async function sendEmail(msg: EmailMessage, provider: EmailProvider = getEmailProvider()): Promise<EmailResult> {
  if (RESERVED.test(msg.to)) return logProvider.send(msg);
  return provider.send(msg);
}
