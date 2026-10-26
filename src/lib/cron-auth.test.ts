import { afterEach, describe, expect, it } from "vitest";
import { cronAuthorized } from "./cron-auth";

const previous = process.env.CRON_SECRET;

afterEach(() => {
  if (previous === undefined) delete process.env.CRON_SECRET;
  else process.env.CRON_SECRET = previous;
});

function headers(values: Record<string, string>) {
  const map = new Map(Object.entries(values).map(([key, value]) => [key.toLowerCase(), value]));
  return (name: string) => map.get(name.toLowerCase()) ?? null;
}

describe("cronAuthorized", () => {
  it("fails closed when the secret is unset and the Vercel cron header is missing", () => {
    delete process.env.CRON_SECRET;
    expect(cronAuthorized(headers({}))).toBe(false);
    expect(cronAuthorized(headers({ authorization: "Bearer " }))).toBe(false);
  });

  it("allows the Vercel cron schedule header when the secret is unset", () => {
    delete process.env.CRON_SECRET;
    expect(cronAuthorized(headers({ "x-vercel-cron-schedule": "0 8 * * *" }))).toBe(true);
    expect(cronAuthorized(headers({ "x-vercel-cron-schedule": "   " }))).toBe(false);
  });

  it("allows a matching bearer secret and rejects a different one when the header is absent", () => {
    process.env.CRON_SECRET = "test-cron-secret";
    expect(cronAuthorized(headers({ authorization: "Bearer test-cron-secret" }))).toBe(true);
    expect(cronAuthorized(headers({ authorization: "Bearer wrong" }))).toBe(false);
    expect(cronAuthorized(headers({ "x-vercel-cron-schedule": "0 8 * * *" }))).toBe(true);
  });
});
