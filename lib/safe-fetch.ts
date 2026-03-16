/**
 * Safe Fetch Utility
 * OpenClaw Multi-Agent Network
 *
 * Wraps the global fetch() with an AbortController-based timeout
 * to prevent requests from hanging indefinitely.
 */

import { FETCH_TIMEOUT_MS } from "./constants";

export interface SafeFetchOptions extends RequestInit {
  /** Timeout in milliseconds. Defaults to FETCH_TIMEOUT_MS (30s). */
  timeoutMs?: number;
}

/**
 * Fetch with automatic timeout via AbortController.
 * Throws an AbortError if the request exceeds timeoutMs.
 */
export async function safeFetch(
  url: string,
  opts: SafeFetchOptions = {},
): Promise<Response> {
  const { timeoutMs = FETCH_TIMEOUT_MS, signal: externalSignal, ...rest } = opts;

  const controller = new AbortController();

  // If caller already provides a signal, abort when either fires
  if (externalSignal) {
    externalSignal.addEventListener("abort", () => controller.abort(externalSignal.reason), {
      once: true,
    });
  }

  const timer = setTimeout(() => controller.abort(new Error("Request timed out")), timeoutMs);

  try {
    return await fetch(url, { ...rest, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}
