import { afterEach, describe, expect, it, vi } from "vitest";
import { isLibraryGone } from "./gone";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("isLibraryGone", () => {
  it("calls library_gone with the service role and not the anon key", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "service-role-test");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon-key-test");
    const fetchMock = vi.fn(async () => new Response("true", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(isLibraryGone("acme/widget", 101)).resolves.toBe(true);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://example.supabase.co/rest/v1/rpc/library_gone");
    const headers = init.headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer service-role-test");
    expect(headers.apikey).toBe("service-role-test");
    expect(JSON.stringify(init)).not.toContain("anon-key-test");
    expect(init.body).toBe(JSON.stringify({ p_repo_key: "acme/widget", p_level: 101 }));
  });

  it("fails open when the service role key is missing", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await expect(isLibraryGone("acme/widget", null)).resolves.toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
