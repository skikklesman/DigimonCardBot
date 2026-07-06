// Webhook alerting (HANDOFF §8 Defense 5): failures announce themselves to
// a private Discord channel. Cardinal rule: alerting is best-effort and
// NEVER throws — a broken webhook must not turn a diagnosable sync failure
// into a crashed invocation.
const MAX_CONTENT = 2000; // Discord message cap

export interface AlertOptions {
  /** Injection point for tests — unit tests never touch the network. */
  fetchImpl?: typeof fetch;
}

/**
 * Post a message to the alert webhook. Returns whether delivery succeeded;
 * an unset webhook (secret not configured) logs and returns false so the
 * sync path works in every environment.
 */
export async function sendSyncAlert(
  webhookUrl: string | undefined,
  content: string,
  options: AlertOptions = {},
): Promise<boolean> {
  const body = content.length > MAX_CONTENT ? `${content.slice(0, MAX_CONTENT - 1)}…` : content;
  if (!webhookUrl) {
    console.warn(`SYNC_ALERT_WEBHOOK not set; alert not delivered: ${body}`);
    return false;
  }
  const { fetchImpl = fetch } = options;
  try {
    const response = await fetchImpl(webhookUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ content: body }),
    });
    if (!response.ok) {
      console.error(`alert webhook responded ${response.status}; alert dropped: ${body}`);
      return false;
    }
    return true;
  } catch (error) {
    console.error(`alert webhook unreachable (${String(error)}); alert dropped: ${body}`);
    return false;
  }
}
