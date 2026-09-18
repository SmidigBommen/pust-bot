/** A dedicated request avoids the Slack SDK's automatic transport and rate-limit retries. */
export function createWeeklyRecapSender(token: string, request: typeof fetch = fetch) {
  return async (channel: string, text: string): Promise<string> => {
    const response = await request("https://slack.com/api/chat.postMessage", {
      method: "POST",
      redirect: "error",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ channel, text, unfurl_links: false, unfurl_media: false }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) throw new Error(`Slack HTTP ${response.status}`);
    const result = await response.json() as { ok?: boolean; ts?: string; error?: string };
    if (!result.ok || !result.ts) throw new Error(`Slack: ${result.error ?? "missing_message_timestamp"}`);
    return result.ts;
  };
}
