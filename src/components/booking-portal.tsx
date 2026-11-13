"use client";

import Link from "next/link";
import { requestBookingEmail } from "@/lib/email/request";
import StudioCalendar from "@/components/studio-calendar";
import { useCallback, useEffect, useRef, useState } from "react";
import { browserSupabase } from "@/lib/supabase/browser";
import { supabaseConfig } from "@/lib/supabase/config";

type Service = { id: string; name: string; duration_minutes: number; price_pence: number };
type Slot = { id: string; starts_at: string; ends_at: string; available: boolean };
type SavedBooking = {
  id: string;
  slot_id: string;
  service_id: string;
  client_name: string;
  price_pence: number;
  duration_minutes: number;
  status: "confirmed" | "cancelled";
  studio_slots: { starts_at: string } | null;
};
const zone = "Europe/London";
const money = (pence: number) => new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(pence / 100);
function dayKey(instant: string) {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date(instant));
  const part = (name: string) => parts.find(item => item.type === name)?.value;
  return [part("year"), part("month"), part("day")].join("-");
}
const dayLabel = (key: string) => new Date(key + "T12:00:00Z").toLocaleDateString("en-GB", { timeZone: zone, weekday: "short", day: "numeric", month: "short" });
const timeLabel = (instant: string) => new Date(instant).toLocaleTimeString("en-GB", { timeZone: zone, hour: "2-digit", minute: "2-digit" });

export default function BookingPortal({ initialView, initialService }: { initialView: "book" | "sessions"; initialService: string }) {
  const [tab, setTab] = useState(initialView);
  const [services, setServices] = useState<Service[]>([]);
  const [slots, setSlots] = useState<Slot[]>([]);
  const [bookings, setBookings] = useState<SavedBooking[]>([]);
  const [userId, setUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [serviceId, setServiceId] = useState(initialService);
  const [date, setDate] = useState("");
  const [slotId, setSlotId] = useState("");
  const [busy, setBusy] = useState(false);
  const [cancelId, setCancelId] = useState<string | null>(null);
  const generation = useRef(0);
  const mutation = useRef(false);
  const mounted = useRef(false);

  const load = useCallback(async () => {
    const request = ++generation.current;

    try {
      const client = browserSupabase();
      const { data: auth, error: authError } = await client.auth.getUser();
      if (request !== generation.current) return;
      setLoading(true);
      setError("");
      setBookings([]);
      setSlots([]);
      if (authError && authError.name !== "AuthSessionMissingError") throw new Error("Your session could not be checked. Try again or sign in.");
      setUserId(auth.user?.id ?? null);
      if (!auth.user) return;
      const [serviceResult, slotResult, bookingResult] = await Promise.all([
        client.from("studio_services").select("id,name,duration_minutes,price_pence").order("price_pence"),
        client.rpc("forma_available_slots"),
        client.from("studio_bookings").select("id,slot_id,service_id,client_name,price_pence,duration_minutes,status,studio_slots(starts_at)").eq("user_id", auth.user.id).order("created_at", { ascending: false }),
      ]);
      if (request !== generation.current) return;
      if (serviceResult.error || slotResult.error || bookingResult.error) {
        throw new Error("We couldn’t load bookings and availability. Check your connection and try again.");
      }
      const loadedServices = serviceResult.data as Service[];
      const loadedSlots = slotResult.data as Slot[];
      setServices(loadedServices);
      setSlots(loadedSlots);
      setBookings(bookingResult.data as unknown as SavedBooking[]);
      setServiceId(current => loadedServices.some(item => item.id === current) ? current : loadedServices[0]?.id || "");
      setDate(current => loadedSlots.some(item => dayKey(item.starts_at) === current) ? current : loadedSlots[0] ? dayKey(loadedSlots[0].starts_at) : "");
      setSlotId(current => loadedSlots.some(item => item.id === current && item.available) ? current : "");
    } catch (cause) {
      if (request === generation.current) setError(cause instanceof Error ? cause.message : "The booking service is unavailable. Please try again.");
    } finally {
      if (request === generation.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    mounted.current = true;
    // Synchronize initial state with the external auth and booking service.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
    const refresh = () => { if (!mutation.current) void load(); };
    window.addEventListener("focus", refresh);
    const client = browserSupabase();
    const { data } = client.auth.onAuthStateChange(event => {
      if (event === "SIGNED_OUT") {
        ++generation.current;
        setUserId(null);
        setBookings([]);
        setSlots([]);
        setLoading(false);
      }
      // Loading asynchronously avoids calling Supabase inside its auth callback.
      if (event === "SIGNED_IN" || event === "USER_UPDATED") queueMicrotask(() => { if (mounted.current && !mutation.current) void load(); });
    });
    return () => {
      mounted.current = false;
      // Invalidate in-flight requests when this portal unmounts.
      // eslint-disable-next-line react-hooks/exhaustive-deps
      ++generation.current;
      window.removeEventListener("focus", refresh);
      data.subscription.unsubscribe();
    };
  }, [load]);

  const days = [...new Set(slots.map(slot => dayKey(slot.starts_at)))];
  const service = services.find(item => item.id === serviceId);
  const selectedSlot = slots.find(item => item.id === slotId && item.available);
  async function book(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (mutation.current || !selectedSlot || !service || !userId) return;
    const name = String(new FormData(event.currentTarget).get("name") || "").trim();
    if (!name) { setMessage("Enter a name for this booking."); return; }
    mutation.current = true;
    setBusy(true);
    setMessage("");
    try {
      const { data: savedBooking, error: bookingError } = await browserSupabase().rpc("forma_book_slot", {
        p_slot_id: selectedSlot.id, p_service_id: service.id, p_client_name: name,
      });
      if (bookingError) {
        setMessage(bookingError.code === "23505" ? "That time has just been booked. Choose another slot." : "The booking could not be confirmed. Refresh your bookings before trying again.");
        await load();
        return;
      }
      const bookingId = Array.isArray(savedBooking) ? savedBooking[0]?.id : savedBooking?.id;
      if (bookingId) void requestBookingEmail(bookingId);
      setMessage("Your session is saved to your account.");
      setSlotId("");
      setTab("sessions");
      await load();
    } catch {
      setMessage("The connection was interrupted. Refresh My bookings to check whether your session was saved before trying again.");
    } finally { mutation.current = false; if (mounted.current) setBusy(false); }
  }
  async function cancel(id: string) {
    if (mutation.current) return;
    mutation.current = true;
    setBusy(true);
    setMessage("");
    try {
      const { error: cancelError } = await browserSupabase().rpc("forma_cancel_booking", { p_booking_id: id });
      if (!cancelError) void requestBookingEmail(id);
      setMessage(cancelError ? "Cancellation could not be confirmed. Refresh to check the session status." : "Your session is cancelled. Its time is available again.");
      setCancelId(null);
      await load();
    } catch { setMessage("The connection was interrupted. Refresh to check the cancellation status."); }
    finally { mutation.current = false; if (mounted.current) setBusy(false); }
  }
  return <section className="section booking-section">
    <div className="section-heading"><div><div className="eyebrow">YOUR FORMA SESSIONS</div><h1 className="page-title">{tab === "book" ? "Make your next move." : "Your next steps."}</h1></div><p>All session times use Europe/London.<br />Test bookings · No payment collected.</p></div>
    <div className="portal-tabs"><button disabled={busy} aria-pressed={tab === "book"} onClick={() => { setTab("book"); setMessage(""); }}>Book a session</button><button disabled={busy} aria-pressed={tab === "sessions"} onClick={() => { setTab("sessions"); setMessage(""); }}>My bookings</button><button className="text-link" disabled={busy || loading} onClick={() => void load()}>Refresh availability</button></div>
    {message && <p className="notice" role="status">{message}</p>}
    {loading ? <p className="notice" role="status">Loading your bookings and available times…</p> :
      error ? <div className="notice" role="alert"><p>{error}</p><button className="text-link" onClick={() => void load()}>Try again</button></div> :
      !userId ? <div className="empty-state"><h2>Your sessions, in one place.</h2><p>Sign in to see available times and save bookings to your account.</p><Link className="button lime" href="/account">Sign in or create an account <span>↗</span></Link></div> :
      tab === "book" ? <form className="booking-grid" onSubmit={book}><div className="booking-fields">
        <fieldset disabled={busy}><legend>Choose your session</legend><div className="service-options">{services.map(item => <label key={item.id} className={"service-option " + (item.id === serviceId ? "selected" : "")}><input type="radio" name="service" checked={item.id === serviceId} onChange={() => setServiceId(item.id)} /><span><strong>{item.name}</strong><small>{item.duration_minutes} min · One-to-one</small></span><b>{item.price_pence ? money(item.price_pence) : "Free"}</b></label>)}</div>{services.length === 0 && <p>No services are currently offered.</p>}</fieldset>

        <div className="client-schedule">
          <fieldset disabled={busy}><legend>Pick a day</legend>
            {days.length ? <StudioCalendar value={date} availableDays={days} disabled={busy} onChange={value => { setDate(value); setSlotId(""); }} /> : <p className="field-hint">No times are currently published. Please check back later.</p>}
          </fieldset>
          <fieldset disabled={busy}><legend>Find your time</legend><p className="field-hint">{date ? dayLabel(date) : "Choose a day first"} · London time</p><div className="time-options">{slots.filter(slot => dayKey(slot.starts_at) === date).map(slot => <button key={slot.id} type="button" disabled={!slot.available} aria-pressed={slotId === slot.id} className={slotId === slot.id ? "selected" : ""} onClick={() => setSlotId(slot.id)}>{timeLabel(slot.starts_at)}{!slot.available && <small>Booked</small>}</button>)}</div></fieldset>
        </div>
        <label className="name-label" htmlFor="client-name">Your name <span>Use a fictional name while testing.</span></label><input className="name-input" name="name" id="client-name" required maxLength={80} disabled={busy} autoComplete="off" placeholder="e.g. Jamie Taylor" />
      </div><aside className="booking-summary"><div className="eyebrow">YOUR SESSION</div><h2>{service?.name || "Choose a session"}</h2><p>{service?.duration_minutes} min · With Alex Carter</p><hr /><dl><div><dt>Day</dt><dd>{date ? dayLabel(date) : "Choose a day"}</dd></div><div><dt>Time</dt><dd>{selectedSlot ? timeLabel(selectedSlot.starts_at) : "Choose a time"}</dd></div><div><dt>Price</dt><dd>{service ? money(service.price_pence) : "—"}</dd></div></dl><p className="demo-note">Your booking will be saved to your account. You can manage it from My bookings. No payment is collected.</p><button className="button lime" disabled={busy || !selectedSlot || !service} type="submit">{busy ? "Saving…" : "Confirm booking"}<span>↗</span></button></aside></form> :
      bookings.length === 0 ? <div className="empty-state"><h2>Room for a fresh start.</h2><p>Your saved sessions will appear here.</p><button className="button lime" onClick={() => setTab("book")}>Book your first session <span>↗</span></button></div> :
      <div className="bookings-list">{bookings.map(item => <article className="saved-booking" key={item.id}><div className="saved-details"><span className={"status-pill status-" + item.status}>{item.status === "cancelled" ? "CANCELLED" : "CONFIRMED"}</span><h2>{services.find(s => s.id === item.service_id)?.name || item.service_id}</h2><p>{item.studio_slots ? dayLabel(dayKey(item.studio_slots.starts_at)) + " · " + timeLabel(item.studio_slots.starts_at) : "Session time unavailable"} · {item.duration_minutes} min · {money(item.price_pence)}</p><p>{item.client_name}</p></div>{item.status === "confirmed" && (cancelId === item.id ? <div className="cancel-actions"><span>Cancel this session?</span><button disabled={busy} className="cancel-confirm" onClick={() => void cancel(item.id)}>Yes, cancel</button><button disabled={busy} className="text-link" onClick={() => setCancelId(null)}>Keep session</button></div> : <button disabled={busy} className="text-link" onClick={() => setCancelId(item.id)}>Cancel session</button>)}</article>)}</div>}
  </section>;
}

export function ConfiguredBookingPortal(props: { initialView: "book" | "sessions"; initialService: string }) {
  if (!supabaseConfig()) return <section className="section"><p className="notice">The booking service is not configured yet. Please try again later.</p></section>;
  return <BookingPortal {...props} />;
}
