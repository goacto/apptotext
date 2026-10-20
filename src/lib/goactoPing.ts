/**
 * GOACTO first-party daily ping (REQ v0.3.1 §4.6.1). Copy this one file into an app.
 * Sends at most one anonymous ping per app per device per local day. No cookies,
 * no account ids, no page names. Skips when opted out or Global Privacy Control is on.
 */
export type GoactoApp = "focus_log" | "scriptlabos" | "mindscape" | "si_agent_space" | "nightlight" | "apptotext";
type Env = {
  storage: Pick<Storage, "getItem" | "setItem" | "removeItem">;
  fetch: typeof fetch;
  now?: () => Date;
  gpc?: boolean;
  uuid?: () => string;
  endpoint?: string;
};
const AID = "goacto:aid:v1";
const OPT_OUT = "goacto:usage-optout:v1";
const last = (app: GoactoApp) => `goacto:ping-day:v1:${app}`;
const localDay = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

export function setUsageSharing(env: Pick<Env, "storage">, on: boolean): void {
  if (on) env.storage.removeItem(OPT_OUT);
  else env.storage.setItem(OPT_OUT, "1");
}
export function usageSharingOn(env: Pick<Env, "storage">): boolean {
  return env.storage.getItem(OPT_OUT) !== "1";
}
export function resetUsageId(env: Pick<Env, "storage">): void {
  env.storage.removeItem(AID);
}

/** Returns true when a ping was sent. Never throws, never blocks UI. */
export async function sendDailyPing(app: GoactoApp, env: Env): Promise<boolean> {
  try {
    const gpc = env.gpc ?? (globalThis as { navigator?: { globalPrivacyControl?: boolean } }).navigator?.globalPrivacyControl === true;
    if (gpc || env.storage.getItem(OPT_OUT) === "1") return false;
    const day = localDay(env.now ? env.now() : new Date());
    if (env.storage.getItem(last(app)) === day) return false;
    let aid = env.storage.getItem(AID);
    const first = !aid;
    if (!aid) {
      aid = (env.uuid ?? (() => crypto.randomUUID()))();
      env.storage.setItem(AID, aid);
    }
    env.storage.setItem(last(app), day); // set before sending: at most one attempt per day
    const body = JSON.stringify({ v: 1, app, day, aid, first });
    const res = await env.fetch(env.endpoint ?? "https://siagentspace.com/api/ping", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
      keepalive: true,
      credentials: "omit",
    });
    return res.ok;
  } catch {
    return false;
  }
}
