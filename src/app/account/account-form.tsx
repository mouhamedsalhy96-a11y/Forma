"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { User } from "@supabase/supabase-js";
import { browserSupabase } from "@/lib/supabase/browser";

export default function AccountForm() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [message, setMessage] = useState("");

  useEffect(() => {
    let active = true;
    const client = browserSupabase();
    client.auth.getUser().then(({ data, error }) => {
      if (!active) return;
      setUser(data.user);
      if (error && error.name !== "AuthSessionMissingError") setMessage("We could not verify your session. Please try signing in again.");
      if (new URLSearchParams(location.search).get("confirmation") === "failed") {
        setMessage("That confirmation link could not be used. Open the latest link in the browser where you signed up, or request another below.");
      }
      setLoading(false);
    }).catch(() => {
      if (active) { setLoading(false); setMessage("The account service is unavailable. Try again shortly."); }
    });
    const { data } = client.auth.onAuthStateChange((_event, session) => {
      if (active) setUser(session?.user ?? null);
    });
    return () => { active = false; data.subscription.unsubscribe(); };
  }, []);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    const values = new FormData(event.currentTarget);
    const email = String(values.get("email") || "").trim();
    const password = String(values.get("password") || "");
    try {
      const client = browserSupabase();
      if (mode === "signup") {
        const { data, error } = await client.auth.signUp({
          email, password,
          options: { emailRedirectTo: location.origin + "/auth/callback" },
        });
        if (error) { setMessage(error.message); return; }
        setUser(data.user && data.session ? data.user : null);
        setMessage(data.session ? "Your account is ready." : "Check your inbox for a confirmation link. If you already have an account, sign in or request a new confirmation email.");
      } else {
        const { data, error } = await client.auth.signInWithPassword({ email, password });
        if (error) { setMessage(error.message); return; }
        setUser(data.user);
        setMessage("You’re signed in.");
      }
    } catch { setMessage("We could not reach the account service. Please try again."); }
    finally { setBusy(false); }
  }
  async function resend(event: React.MouseEvent<HTMLButtonElement>) {
    const form = event.currentTarget.form;
    const emailField = form?.elements.namedItem("email") as HTMLInputElement | null;
    if (!emailField?.reportValidity()) return;
    setBusy(true);
    try {
      const { error } = await browserSupabase().auth.resend({
        type: "signup", email: emailField.value.trim(),
        options: { emailRedirectTo: location.origin + "/auth/callback" },
      });
      setMessage(error ? error.message : "If this account needs confirmation, a new link has been requested. Check your inbox.");
    } catch { setMessage("We could not request an email. Please try again."); }
    finally { setBusy(false); }
  }
  async function signOut() {
    setBusy(true);
    try {
      const { error } = await browserSupabase().auth.signOut();
      if (error) { setMessage("Sign out failed. Please try again."); return; }
      setUser(null);
      setMessage("You’re signed out.");
    } catch { setMessage("Sign out failed. Please try again."); }
    finally { setBusy(false); }
  }
  if (loading) return <p className="notice" role="status">Checking your session…</p>;
  return <div className="account-card">
    {user ? <><h2>You’re in.</h2><p>Signed in as <strong>{user.email}</strong>.</p><p>Your account is connected. Book a session or manage your saved bookings from the studio.</p><Link className="button lime" href="/">Go to sessions <span>↗</span></Link><button className="button dark" disabled={busy} onClick={signOut}>{busy ? "Signing out…" : "Sign out"} <span>↗</span></button></> :
    <><div className="account-tabs"><button aria-pressed={mode === "login"} onClick={() => { setMode("login"); setMessage(""); }} disabled={busy}>Sign in</button><button aria-pressed={mode === "signup"} onClick={() => { setMode("signup"); setMessage(""); }} disabled={busy}>Create account</button></div>
      <form onSubmit={submit}><label htmlFor="email">Email address</label><input id="email" name="email" type="email" autoComplete="email" required maxLength={254} disabled={busy} />
      <label htmlFor="password">Password</label><input id="password" name="password" type="password" autoComplete={mode === "signup" ? "new-password" : "current-password"} minLength={mode === "signup" ? 12 : undefined} required maxLength={128} disabled={busy} />
      {mode === "signup" && <p className="muted">Use at least 12 characters. Use a test account while this prototype is in development.</p>}
      <button className="button lime" type="submit" disabled={busy}>{busy ? "Please wait…" : mode === "login" ? "Sign in" : "Create account"}<span>↗</span></button>
      <button className="text-link" type="button" disabled={busy} onClick={resend}>Resend confirmation email</button><Link href="/account/forgot-password" className="text-link">Forgot your password?</Link></form></>}
    {message && <p className="notice" role="status">{message}</p>}
  </div>;
}
