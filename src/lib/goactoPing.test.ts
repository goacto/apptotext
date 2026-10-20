import { test, expect } from 'vitest';
import { sendDailyPing, setUsageSharing, usageSharingOn } from './goactoPing';

const mem = () => {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => { m.set(k, v); }, removeItem: (k: string) => { m.delete(k); } };
};
const okFetch = (calls: any[]) => (async (u: string, o: any) => { calls.push([u, o]); return { ok: true }; }) as any;

test('Focus Log sends one focus_log ping per local day to the SI Agent Space endpoint', async () => {
  const calls: any[] = [];
  const env = { storage: mem(), fetch: okFetch(calls), gpc: false, uuid: () => '6f1c2a0e-5b7d-4c1a-9e2f-3a4b5c6d7e8f', now: () => new Date(2026, 9, 15, 9) };
  expect(await sendDailyPing('apptotext', env)).toBe(true);
  expect(await sendDailyPing('apptotext', env)).toBe(false);
  expect(calls).toHaveLength(1);
  expect(calls[0][0]).toBe('https://siagentspace.com/api/ping');
  expect(JSON.parse(calls[0][1].body)).toEqual({ v: 1, app: 'apptotext', day: '2026-10-15', aid: '6f1c2a0e-5b7d-4c1a-9e2f-3a4b5c6d7e8f', first: true });
  expect(calls[0][1].credentials).toBe('omit');
});

test('toggle off or GPC: nothing is sent', async () => {
  const calls: any[] = [];
  const storage = mem();
  expect(usageSharingOn({ storage })).toBe(true);
  setUsageSharing({ storage }, false);
  expect(usageSharingOn({ storage })).toBe(false);
  expect(await sendDailyPing('apptotext', { storage, fetch: okFetch(calls), gpc: false })).toBe(false);
  expect(await sendDailyPing('apptotext', { storage: mem(), fetch: okFetch(calls), gpc: true })).toBe(false);
  expect(calls).toHaveLength(0);
});

test('a failing network never throws', async () => {
  const env = { storage: mem(), fetch: (async () => { throw new Error('offline'); }) as any, gpc: false, uuid: () => 'x' };
  expect(await sendDailyPing('apptotext', env)).toBe(false);
});
