import "server-only";
import { createClient } from "@supabase/supabase-js";
import { supabaseConfig } from "@/lib/supabase/config";
import { sendQueuedEmail, type QueuedEmail } from "./resend";

function emailConfiguration() {
  const config = supabaseConfig();
  const secret = process.env.SUPABASE_SECRET_KEY?.trim();
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const from = process.env.FORMA_EMAIL_FROM?.trim();
  const mode = process.env.FORMA_EMAIL_MODE || "test";
  const testTo = process.env.FORMA_EMAIL_TEST_TO?.trim();
  if (!config || !secret || !apiKey || !from || !["test", "live"].includes(mode)) return null;
  if (mode === "test" && !testTo) return null;
  return { url: config.url, secret, apiKey, from, testTo: mode === "test" ? testTo : null };
}

export function emailDeliveryConfigured() {
  return Boolean(emailConfiguration());
}

export async function processBookingEmails(bookingId: string | null) {
  const config = emailConfiguration();
  if (!config) return { accepted: 0, failed: 0, enabled: false };
  const client = createClient(config.url, config.secret, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const { data, error } = await client.rpc("forma_claim_booking_emails", {
    p_booking_id: bookingId, p_from: config.from, p_test_to: config.testTo,
  });
  if (error) throw new Error("Notification queue could not be claimed.");
  let accepted = 0;
  let failed = 0;
  for (const email of (data || []) as QueuedEmail[]) {
    const result = await sendQueuedEmail(email, config.apiKey);
    const { data: updated, error: updateError } = await client.from("studio_email_outbox").update({
      status: result.accepted ? "sent" : email.attempts >= 5 ? "failed" : "pending",
      provider_id: result.providerId || null,
      sent_at: result.accepted ? new Date().toISOString() : null,
      last_error: result.reason || null,
      next_attempt_at: new Date(Date.now() + 60000).toISOString(),
      lease_until: null,
      claim_token: null,
    }).eq("id", email.id).eq("claim_token", email.claim_token).eq("status", "processing").select("id");
    if (updateError || !updated?.length) {
      // Leave the leased event for a later retry using the same provider key.
      throw new Error("Notification result could not be recorded.");
    }
    if (result.accepted) accepted++;
    else failed++;
  }
  return { accepted, failed, enabled: true };
}
