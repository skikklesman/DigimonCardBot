// Shared test double for the alert webhook. Both the sync path
// (scheduled.test.ts) and the request path (index.test.ts) stub global fetch
// to capture what got POSTed to the webhook; this is that one stub (chunk 4.5
// finding #7). The main worker shares the test isolate, so the stub applies to
// it too. Any unexpected outbound fetch throws, so a test can't silently hit
// the network.
import { vi } from "vitest";

/**
 * Stub global fetch: capture the `content` of every POST to `webhookUrl`
 * (returned array, appended in order) and serve any extra `routes` by URL.
 * Everything else throws. Pair with `vi.unstubAllGlobals()` in afterEach.
 */
export function stubOutboundFetch(
  webhookUrl: string,
  routes: Record<string, () => Response> = {},
): string[] {
  const alerts: string[] = [];
  vi.stubGlobal("fetch", (async (url: unknown, init?: RequestInit) => {
    const u = String(url);
    if (u === webhookUrl) {
      alerts.push((JSON.parse(String(init?.body)) as { content: string }).content);
      return new Response(null, { status: 204 });
    }
    const route = routes[u];
    if (route) return route();
    throw new Error(`unexpected outbound fetch in test: ${u}`);
  }) as typeof fetch);
  return alerts;
}
