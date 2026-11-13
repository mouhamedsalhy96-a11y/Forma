"use client";

import { useRef, useState } from "react";
import { browserSupabase } from "@/lib/supabase/browser";

export default function RecoveryForm() {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const sending = useRef(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (sending.current) return;
    const email = String(new FormData(event.currentTarget).get("email") || "").trim();
    sending.current = true;
    setBusy(true);
    setMessage("");
    try {
      const { error } = await browserSupabase().auth.resetPasswordForEmail(email, {
        redirectTo: location.origin + "/auth/callback?next=/account/reset-password",
      });

      if (error) {
        const messages: Record<string, string> = {
          over_email_send_rate_limit: "The email sending limit has been reached. Please wait before requesting another link.",
          over_request_rate_limit: "Too many requests have been made. Please wait before trying again.",
          email_address_not_authorized: "The email service is not configured to send to this address yet. The studio needs to configure its email provider.",
          email_provider_disabled: "Email sign-in is disabled for this project. The studio needs to enable the email provider.",
          email_address_invalid: "Check the email address and try again.",
          unexpected_failure: "The account service could not send the email. Check the Supabase Auth logs for the email provider error.",
        };
        const detail = error.code ? messages[error.code] : undefined;
        setMessage((detail || error.message || "The reset request failed.") +
          (error.code ? " (" + error.code + ")" : error.status ? " (HTTP " + error.status + ")" : ""));
        return;
      }
      setMessage("If an account exists for this email, a password reset link has been requested. Check your inbox and spam folder. Open the latest link in this same browser.");
    } catch { setMessage("We couldn’t reach the account service. Please try again."); }
    finally { sending.current = false; setBusy(false); }
  }
  return <div className="account-card"><p>Enter your account email and we’ll request a link to set a new password.</p>
    <form onSubmit={submit}><label htmlFor="recovery-email">Email address</label><input type="email" id="recovery-email" name="email" autoComplete="email" required maxLength={254} disabled={busy} /><button className="button lime" disabled={busy} type="submit">{busy ? "Requesting link…" : "Send reset link"}<span>↗</span></button></form>
    {message && <p className="notice" role="status">{message}</p>}
  </div>;
}
