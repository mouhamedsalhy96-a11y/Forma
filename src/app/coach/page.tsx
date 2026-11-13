import Link from "next/link";
import { supabaseConfig } from "@/lib/supabase/config";
import CoachDashboard from "./coach-dashboard";

export default function CoachPage() {
  return <>
    <div className="demo-bar">Forma · Trainer workspace · Fictional studio</div>
    <header className="header"><Link className="wordmark" href="/">forma<span>®</span></Link><nav aria-label="Trainer navigation"><Link href="/coach/availability" className="account-nav">Availability</Link><Link href="/" className="account-nav">Studio</Link><Link href="/account" className="account-nav">Account</Link></nav></header>
    <main className="section"><div className="section-heading"><div><div className="eyebrow">TRAINER WORKSPACE</div><h1 className="page-title">Your studio, in focus.</h1></div><p>Client bookings and session history.<br />All times use Europe/London.</p></div>
      {supabaseConfig() ? <CoachDashboard /> : <p className="notice">The trainer workspace is awaiting connection setup.</p>}
    </main>
  </>;
}
