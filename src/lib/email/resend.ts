export type QueuedEmail = {
  id: string;
  claim_token: string;
  attempts: number;
  body_text: string;
  delivery_from: string;
  delivery_to: string;
  delivery_subject: string;
};

export async function sendQueuedEmail(
  email: QueuedEmail,
  apiKey: string,
  send: typeof fetch = fetch,
): Promise<{ accepted: boolean; providerId?: string; reason?: string }> {
  try {
    const response = await send("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: "Bearer " + apiKey,
        "Content-Type": "application/json",
        "Idempotency-Key": "forma-email/" + email.id,
      },
      body: JSON.stringify({
        from: email.delivery_from,
        to: [email.delivery_to],
        subject: email.delivery_subject,
        text: email.body_text,
      }),
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) return { accepted: false, reason: "Provider HTTP " + response.status };
    const result: unknown = await response.json();
    if (!result || typeof result !== "object" || !("id" in result) || typeof result.id !== "string") {
      return { accepted: false, reason: "Invalid provider response" };
    }
    return { accepted: true, providerId: result.id };
  } catch { return { accepted: false, reason: "Provider timeout or connection failure" }; }
}
