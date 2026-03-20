import { describe, it, expect, vi, afterEach } from "vitest";
import { safeFetch } from "../safe-fetch";

describe("safe-fetch", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns response on successful fetch", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("ok", { status: 200 })),
    );

    const res = await safeFetch("https://example.com/api");
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("ok");
  });

  it("passes through request options", async () => {
    const mockFetch = vi.fn().mockResolvedValue(new Response("ok", { status: 200 }));
    vi.stubGlobal("fetch", mockFetch);

    await safeFetch("https://example.com/api", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: '{"key":"value"}',
    });

    const [url, opts] = mockFetch.mock.calls[0];
    expect(url).toBe("https://example.com/api");
    expect(opts.method).toBe("POST");
    expect(opts.headers).toEqual({ "Content-Type": "application/json" });
    expect(opts.body).toBe('{"key":"value"}');
  });

  it("aborts after timeoutMs", async () => {
    vi.useFakeTimers();

    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(
        (_url: string, opts: RequestInit) =>
          new Promise((_resolve, reject) => {
            opts.signal?.addEventListener("abort", () => {
              reject(new DOMException("The operation was aborted.", "AbortError"));
            });
          }),
      ),
    );

    const promise = safeFetch("https://example.com/slow", { timeoutMs: 5000 });
    vi.advanceTimersByTime(5000);

    await expect(promise).rejects.toThrow();

    vi.useRealTimers();
  });

  it("clears timeout on successful response", async () => {
    const clearTimeoutSpy = vi.spyOn(globalThis, "clearTimeout");

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("ok", { status: 200 })),
    );

    await safeFetch("https://example.com/fast", { timeoutMs: 30000 });

    expect(clearTimeoutSpy).toHaveBeenCalled();
  });

  it("uses default 30s timeout when none specified", async () => {
    const setTimeoutSpy = vi.spyOn(globalThis, "setTimeout");

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("ok", { status: 200 })),
    );

    await safeFetch("https://example.com/api");

    // Find the setTimeout call from safeFetch (not other timers)
    const safeFetchTimeout = setTimeoutSpy.mock.calls.find(
      (call) => call[1] === 30_000,
    );
    expect(safeFetchTimeout).toBeDefined();
  });
});
