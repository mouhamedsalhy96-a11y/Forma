import Link from "next/link";
import { supabaseConfig } from "@/lib/supabase/config";
import AvailabilityManager from "./availability-manager";

export default function AvailabilityPage() {
  return <>
    <div className="demo-bar">Forma · Trainer workspace · Fictional studio</div>
    <header className="header"><Link className="wordmark" href="/">forma<span>®</span></Link><nav aria-label="Trainer navigation"><Link className="account-nav" href="/coach">Bookings</Link><Link className="account-nav" href="/account">Account</Link></nav></header>
    <main className="section"><div className="section-heading"><div><div className="eyebrow">STUDIO AVAILABILITY</div><h1 className="page-title">Make room for progress.</h1></div><p>Publish times for the next 28 days.<br />Studio time zone: Europe/London.</p></div>
      {supabaseConfig() ? <AvailabilityManager /> : <p className="notice">Connect Supabase to manage availability.</p>}
    </main>
  </>;
}
