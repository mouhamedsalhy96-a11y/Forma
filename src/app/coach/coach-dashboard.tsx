"use client";

import Link from "next/link";
import { requestBookingEmail } from "@/lib/email/request";
import { useCallback, useEffect, useRef, useState } from "react";
import { browserSupabase } from "@/lib/supabase/browser";

type Booking = {
  id: string;
  client_name: string;
  service_id: string;
  status: "confirmed" | "cancelled";
  duration_minutes: number;
  price_pence: number;
  studio_slots: { starts_at: string } | null;
  studio_services: { name: string } | null;
};
type Access = "loading" | "guest" | "denied" | "allowed" | "error";
const formatPrice = (pence: number) => new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(pence / 100);
const formatTime = (value: string) => new Date(value).toLocaleString("en-GB", { timeZone: "Europe/London", weekday: "short", day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });

export default function CoachDashboard() {
  const [access, setAccess] = useState<Access>("loading");
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [cancelId, setCancelId] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const mutation = useRef(false);
  const requestId = useRef(0);
  const mounted = useRef(false);

  const load = useCallback(async () => {
    const current = ++requestId.current;
    setAccess("loading");
    setBookings([]);
    try {
      const client = browserSupabase();
      const { data: auth, error: authError } = await client.auth.getUser();
      if (current !== requestId.current) return;
      if (authError && authError.name !== "AuthSessionMissingError") throw new Error("Your session could not be verified. Please try again.");
      if (!auth.user) { setAccess("guest"); return; }
      const membership = await client.from("studio_trainers").select("user_id").eq("user_id", auth.user.id).maybeSingle();
      if (current !== requestId.current) return;
      if (membership.error) throw new Error("Trainer access could not be checked. Confirm the trainer migration was applied and try again.");
      if (!membership.data) { setAccess("denied"); return; }
      const result = await client.from("studio_bookings")
        .select("id,client_name,service_id,status,duration_minutes,price_pence,studio_slots(starts_at),studio_services(name)")
        .order("created_at", { ascending: false }).limit(100);
      if (current !== requestId.current) return;
      if (result.error) throw new Error("Bookings could not be loaded. Please try again.");
      setBookings(result.data as unknown as Booking[]);
      setAccess("allowed");
    } catch (cause) {
      if (current !== requestId.current) return;
      setError(cause instanceof Error ? cause.message : "The workspace is unavailable. Please try again.");
      setAccess("error");
    }
  }, []);

  useEffect(() => {
    mounted.current = true;
    // Synchronize the dashboard with the external account and booking service.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
    const refresh = () => { if (!mutation.current) void load(); };
    window.addEventListener("focus", refresh);
    const { data } = browserSupabase().auth.onAuthStateChange(event => {
      if (event === "SIGNED_OUT") {
        ++requestId.current;
        setBookings([]);
        setAccess("guest");
      }
      if (event === "SIGNED_IN" || event === "USER_UPDATED") {
        setTimeout(() => { if (mounted.current && !mutation.current) void load(); }, 0);
      }
    });
    return () => {
      mounted.current = false;
      // Invalidate responses from requests that belonged to this mounted dashboard.
      // eslint-disable-next-line react-hooks/exhaustive-deps
      ++requestId.current;
      window.removeEventListener("focus", refresh);
      data.subscription.unsubscribe();
    };
  }, [load]);


  async function cancelBooking(id: string) {
    if (mutation.current) return;
    mutation.current = true;
    setBusy(true);
    setMessage("");
    try {
      const { error: cancellationError } = await browserSupabase().rpc("forma_trainer_cancel_booking", { p_booking_id: id });
      if (!cancellationError) void requestBookingEmail(id);
      if (!mounted.current) return;
      setMessage(cancellationError
        ? "Cancellation could not be confirmed. The session may have started or your trainer access may have changed. Refresh to check its status."
        : "The booking is cancelled and its slot is available again.");
      setCancelId(null);
      await load();
    } catch {
      if (mounted.current) setMessage("The connection was interrupted. Refresh the booking list to check its status before trying again.");
    } finally {
      mutation.current = false;
      if (mounted.current) setBusy(false);
    }
  }


  async function retryEmail(id: string) {
    if (mutation.current) return;
    mutation.current = true;
    setBusy(true);
    try {
      const result = await requestBookingEmail(id);
      setMessage(result === "queued" ? "Pending email updates have been queued for delivery. Already sent updates will not be sent again."
        : result === "awaiting_setup" ? "Email delivery is awaiting provider setup."
        : "Email delivery could not be requested. The booking record is saved.");
    } finally { mutation.current = false; if (mounted.current) setBusy(false); }
  }

  if (access === "loading") return <p className="notice" role="status">Checking trainer access and loading bookings…</p>;
  if (access === "guest") return <div className="empty-state"><h2>Sign in to your workspace.</h2><p>Use the account assigned as a trainer for this studio.</p><Link href="/account" className="button lime">Sign in <span>↗</span></Link></div>;
  if (access === "denied") return <div className="empty-state"><h2>Trainer access required.</h2><p>Your account can manage its own sessions. The trainer workspace requires studio approval.</p><Link href="/" className="button lime">Back to the studio <span>↗</span></Link></div>;
  if (access === "error") return <div className="notice" role="alert"><p>{error}</p><button className="text-link" onClick={() => void load()}>Try again</button></div>;

  const visible = bookings.filter(booking =>
    (filter === "all" || booking.status === filter) &&
    (booking.client_name + " " + (booking.studio_services?.name || booking.service_id)).toLowerCase().includes(search.trim().toLowerCase())
  ).sort((a, b) => (a.studio_slots?.starts_at || "").localeCompare(b.studio_slots?.starts_at || ""));

  return <>
    {message && <p className="notice" role="status">{message}</p>}
    <div className="coach-toolbar"><div><label htmlFor="booking-status">Booking status</label><select id="booking-status" value={filter} onChange={event => setFilter(event.target.value)}><option value="all">All bookings</option><option value="confirmed">Confirmed</option><option value="cancelled">Cancelled</option></select></div><div><label htmlFor="booking-search">Find a client or session</label><input type="search" id="booking-search" value={search} onChange={event => setSearch(event.target.value)} placeholder="Search bookings" maxLength={100} /></div><button disabled={busy} className="button dark" onClick={() => void load()}>Refresh <span>↗</span></button></div>
    <p className="muted">{visible.length} shown from the latest {bookings.length} bookings. Up to 100 recent records, ordered here by session time. Listed prices describe sessions; payment collection is not enabled.</p>
    {visible.length === 0 ? <div className="empty-state"><h2>{bookings.length ? "No matching sessions." : "A fresh page for your studio."}</h2><p>{bookings.length ? "Change the filters or search to see more bookings." : "Client bookings will appear here when a session is booked."}</p></div> :
    <div className="bookings-list">{visible.map(booking => <article className="saved-booking" key={booking.id}><div className="saved-details"><span className={"status-pill status-" + booking.status}>{booking.status.toUpperCase()}</span><h2>{booking.studio_services?.name || booking.service_id}</h2><p>{booking.studio_slots ? formatTime(booking.studio_slots.starts_at) : "Session time unavailable"}</p><p>{booking.client_name} · {booking.duration_minutes} min · {formatPrice(booking.price_pence)}</p></div>{booking.status === "confirmed" && (cancelId === booking.id
      ? <div className="cancel-actions"><span>Cancel this client’s session?</span><button disabled={busy} className="cancel-confirm" onClick={() => void cancelBooking(booking.id)}>{busy ? "Cancelling…" : "Yes, cancel session"}</button><button disabled={busy} className="text-link" onClick={() => setCancelId(null)}>Keep session</button></div>
      : <button disabled={busy} className="text-link" onClick={() => setCancelId(booking.id)}>Cancel session</button>)}<button className="text-link email-retry" disabled={busy} onClick={() => void retryEmail(booking.id)}>Retry email updates</button></article>)}</div>}
  </>;
}
