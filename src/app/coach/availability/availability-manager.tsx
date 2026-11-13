"use client";

import Link from "next/link";
import StudioCalendar from "@/components/studio-calendar";
import StudioTimePicker from "@/components/studio-time-picker";
import { TZDate } from "react-day-picker";
import { studioDayKey, studioZone } from "@/lib/studio-time";
import { useCallback, useEffect, useRef, useState } from "react";
import { browserSupabase } from "@/lib/supabase/browser";

type Slot = { id: string; starts_at: string; ends_at: string; published: boolean; booked: boolean };
type Access = "loading" | "guest" | "denied" | "allowed" | "error";
function formatTime(value: string) {
  return new Date(value).toLocaleString("en-GB", { timeZone: "Europe/London", weekday: "short", day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

export default function AvailabilityManager() {
  const [access, setAccess] = useState<Access>("loading");
  const [slots, setSlots] = useState<Slot[]>([]);
  const [filter, setFilter] = useState("all");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [day, setDay] = useState("");
  const [loadedAt, setLoadedAt] = useState(0);
  const [time, setTime] = useState("");
  const [range, setRange] = useState({ first: "", last: "" });
  const generation = useRef(0);
  const mutation = useRef(false);
  const mounted = useRef(false);

  const load = useCallback(async () => {
    const request = ++generation.current;
    setAccess("loading");
    setSlots([]);
    try {
      const client = browserSupabase();
      const { data: auth, error: authError } = await client.auth.getUser();
      if (request !== generation.current) return;
      if (authError && authError.name !== "AuthSessionMissingError") throw new Error("Your session could not be verified. Please try again.");
      if (!auth.user) { setAccess("guest"); return; }
      const { data, error: membershipError } = await client.from("studio_trainers").select("user_id").eq("user_id", auth.user.id).maybeSingle();
      if (request !== generation.current) return;
      if (membershipError) throw new Error("Trainer access could not be checked. Try again.");
      if (!data) { setAccess("denied"); return; }
      const result = await client.rpc("forma_trainer_slots");
      if (request !== generation.current) return;
      if (result.error) throw new Error("Availability could not be loaded. Check that migration 003 is applied, then try again.");
      const today = new Date();
      setLoadedAt(today.getTime());
      setRange({ first: studioDayKey(today), last: studioDayKey(new Date(today.getTime() + 28 * 86400000)) });
      setSlots(result.data as Slot[]);
      setAccess("allowed");
    } catch (cause) {
      if (request !== generation.current) return;
      setError(cause instanceof Error ? cause.message : "Availability is unavailable. Try again.");
      setAccess("error");
    }
  }, []);

  useEffect(() => {
    mounted.current = true;
    // Synchronize initial state with the external account and availability service.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
    const refresh = () => { if (!mutation.current) void load(); };
    window.addEventListener("focus", refresh);
    const { data } = browserSupabase().auth.onAuthStateChange(event => {
      if (event === "SIGNED_OUT") {
        ++generation.current;
        setSlots([]);
        setAccess("guest");
      }
      if (event === "SIGNED_IN" || event === "USER_UPDATED") {
        setTimeout(() => { if (mounted.current && !mutation.current) void load(); }, 0);
      }
    });
    return () => {
      mounted.current = false;
      // Invalidate pending responses from this mounted workspace.
      // eslint-disable-next-line react-hooks/exhaustive-deps
      ++generation.current;
      window.removeEventListener("focus", refresh);
      data.subscription.unsubscribe();
    };
  }, [load]);

  async function publish(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (mutation.current) return;
    if (!day || !time) { setMessage("Choose a date and a start time."); return; }
    mutation.current = true;
    setBusy(true);
    setMessage("");
    try {
      const { error: publishError } = await browserSupabase().rpc("forma_publish_slot", {
        p_day: day,
        p_time: time,
      });
      if (publishError) {
        setMessage(publishError.code === "23P01" ? "This time overlaps an existing slot, including hidden slots. Choose another time or republish the existing slot." : publishError.code === "22023" ? "Choose a future quarter-hour time between 06:00 and 20:00 within the next 28 days." : "Publication could not be confirmed. Refresh to check availability.");
      } else { setMessage("Your new slot is published and available to clients."); setTime(""); }
      await load();
    } catch {
      setMessage("The connection was interrupted. Refresh to check whether the slot was published before trying again.");
    } finally { mutation.current = false; if (mounted.current) setBusy(false); }
  }
  async function changePublication(slot: Slot) {
    if (mutation.current) return;
    mutation.current = true;
    setBusy(true);
    setMessage("");
    try {
      const { error: changeError } = await browserSupabase().rpc("forma_set_slot_published", {
        p_slot_id: slot.id, p_published: !slot.published,
      });
      setMessage(changeError ? "The slot could not be changed. It may have just been booked or started. Refresh to check its status." : slot.published ? "The slot is hidden from client availability." : "The slot is published again.");
      await load();
    } catch {
      setMessage("The connection was interrupted. Refresh to check the slot’s status.");
    } finally { mutation.current = false; if (mounted.current) setBusy(false); }
  }

  if (access === "loading") return <p className="notice" role="status">Checking access and loading slots…</p>;
  if (access === "guest") return <div className="empty-state"><h2>Sign in to manage availability.</h2><p>Use your trainer account.</p><Link className="button lime" href="/account">Sign in <span>↗</span></Link></div>;
  if (access === "denied") return <div className="empty-state"><h2>Trainer access required.</h2><p>Your account needs studio approval to manage availability.</p><Link href="/" className="button lime">Back to the studio <span>↗</span></Link></div>;
  if (access === "error") return <div className="notice" role="alert"><p>{error}</p><button className="text-link" onClick={() => void load()}>Try again</button></div>;
  const blockedTimes: string[] = [];
  if (day) {
    const [year, month, date] = day.split("-").map(Number);
    for (let minutes = 6 * 60; minutes <= 20 * 60; minutes += 15) {
      const start = new TZDate(year, month - 1, date, Math.floor(minutes / 60), minutes % 60, 0, studioZone).getTime();
      if (start <= loadedAt || slots.some(slot => start < new Date(slot.ends_at).getTime() && start + 3600000 > new Date(slot.starts_at).getTime())) {
        blockedTimes.push(String(Math.floor(minutes / 60)).padStart(2, "0") + ":" + String(minutes % 60).padStart(2, "0"));
      }
    }
  }
  const visible = slots.filter(slot => filter === "all" || (filter === "published" ? slot.published : !slot.published));
  return <>

    <form className="availability-form" onSubmit={publish}>
      <div className="form-intro"><h2>Publish a session time</h2><p>Choose a studio date and start time. Each slot reserves 60 minutes.</p></div>
      <div className="schedule-picker">
        <fieldset disabled={busy}><legend>Studio date</legend>
          <StudioCalendar value={day} onChange={value => { setDay(value); setTime(""); }} firstDay={range.first} lastDay={range.last} disabled={busy} name="day" />
        </fieldset>
        <fieldset disabled={busy}><legend>Start time</legend>
          <StudioTimePicker value={time} onChange={setTime} blockedTimes={blockedTimes} disabled={busy || !day} />
          {!day && <p className="field-hint">Choose a date to see available start times.</p>}
          <div className="publish-action"><div><span className="eyebrow">SESSION LENGTH</span><strong>60 minutes</strong></div><button type="submit" className="button lime" disabled={busy || !day || !time || blockedTimes.includes(time)}>{busy ? "Saving…" : "Publish slot"}<span>↗</span></button></div>
        </fieldset>
      </div>
    </form>
    {message && <p className="notice" role="status">{message}</p>}
    <div className="coach-toolbar"><div><label htmlFor="publication-filter">Publication status</label><select id="publication-filter" value={filter} onChange={event => setFilter(event.target.value)}><option value="all">All future slots</option><option value="published">Published</option><option value="hidden">Hidden</option></select></div><button disabled={busy} className="button dark" onClick={() => void load()}>Refresh <span>↗</span></button></div>
    <p className="muted">{visible.length} slots shown in the next 28 days. Booked slots stay published until their booking is cancelled.</p>
    {visible.length === 0 ? <div className="empty-state"><h2>No matching slots.</h2><p>Publish a time above or change the status filter.</p></div> :
      <div className="bookings-list">{visible.map(slot => <article key={slot.id} className="saved-booking"><div className="saved-details"><span className={"status-pill " + (slot.booked ? "status-booked" : slot.published ? "status-confirmed" : "status-cancelled")}>{slot.published ? "PUBLISHED" : "HIDDEN"}{slot.booked ? " · BOOKED" : ""}</span><h2>{formatTime(slot.starts_at)}</h2><p>60-minute studio slot</p></div><button className="text-link" disabled={busy || slot.booked} onClick={() => void changePublication(slot)}>{slot.booked ? "Booking active" : slot.published ? "Hide slot" : "Publish again"}</button></article>)}</div>}
  </>;
}
