"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { browserSupabase } from "@/lib/supabase/browser";

export default function ResetPasswordForm() {
  const [access, setAccess] = useState<"loading" | "allowed" | "missing">("loading");
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [message, setMessage] = useState("");
  const saving = useRef(false);

  useEffect(() => {
    let active = true;
    const client = browserSupabase();
    client.auth.getUser().then(({ data, error }) => {
      if (active) setAccess(!error && data.user ? "allowed" : "missing");
    }).catch(() => { if (active) setAccess("missing"); });
    const { data } = client.auth.onAuthStateChange(event => {
      if (active && event === "SIGNED_OUT") setAccess("missing");
    });
    return () => { active = false; data.subscription.unsubscribe(); };
  }, []);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving.current) return;
    const form = event.currentTarget;
    const values = new FormData(form);
    const password = String(values.get("password") || "");
    if (password !== values.get("confirmation")) { setMessage("The passwords don’t match."); return; }
    if (password.length < 12) { setMessage("Use at least 12 characters."); return; }
    saving.current = true;
    setBusy(true);
    setMessage("");
    try {
      const client = browserSupabase();
      const { error } = await client.auth.updateUser({ password });
      if (error) { setMessage("The password could not be changed. Use a different password or request a fresh reset link."); return; }
      setSaved(true);
      form.reset();
      try {
        const { error: signOutError } = await client.auth.signOut();
        setMessage(signOutError ? "Your password is saved. Please sign out from Account before signing in again." : "Your password is saved. Sign in again using your new password.");
      } catch { setMessage("Your password is saved. Please sign out from Account before signing in again."); }
    } catch { setMessage("The connection was interrupted. Try signing in with your new password to check whether it was saved, or request another reset link."); }
    finally { saving.current = false; setBusy(false); }
  }
  if (saved) return <div className="account-card"><h2>Password updated.</h2><p role="status">{message || "Your new password has been saved."}</p><Link href="/account" className="button lime">Go to sign in <span>↗</span></Link></div>;
  if (access === "loading") return <p className="notice" role="status">Checking your reset session…</p>;
  if (access === "missing") return <div className="account-card"><h2>A new link is needed.</h2><p>Your reset session is missing or has expired. Request a fresh link and open it in the browser where you requested it.</p><Link href="/account/forgot-password" className="button lime">Request a reset link <span>↗</span></Link></div>;
  return <div className="account-card"><p>Choose a new password with at least 12 characters.</p>
    <form onSubmit={submit}><label htmlFor="new-password">New password</label><input id="new-password" name="password" type="password" autoComplete="new-password" minLength={12} maxLength={128} required disabled={busy} /><label htmlFor="confirm-password">Confirm new password</label><input id="confirm-password" name="confirmation" type="password" autoComplete="new-password" minLength={12} maxLength={128} required disabled={busy} /><button className="button lime" type="submit" disabled={busy}>{busy ? "Saving…" : "Save new password"}<span>↗</span></button></form>
    {message && <p className="notice" role="status">{message}</p>}
  </div>;
}
