export async function requestBookingEmail(bookingId: string): Promise<"queued" | "awaiting_setup" | "unavailable"> {
  try {
    const response = await fetch("/api/notifications/deliver", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bookingId }),
      keepalive: true,
    });
    if (!response.ok) return "unavailable";
    const result = await response.json();
    return result.status === "queued" ? "queued" : result.status === "awaiting_setup" ? "awaiting_setup" : "unavailable";
  } catch { return "unavailable"; }
}
