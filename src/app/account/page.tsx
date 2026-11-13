import Link from "next/link";
import { supabaseConfig } from "@/lib/supabase/config";
import AccountForm from "./account-form";

export default function AccountPage() {
  return <><div className="demo-bar">Forma · Development prototype · Use test details</div>
    <header className="header"><Link className="wordmark" href="/">forma<span>®</span></Link><Link className="text-link" href="/">← Back to the studio</Link></header>
    <main className="section account-section"><div className="eyebrow">YOUR FORMA ACCOUNT</div><h1 className="page-title">Make space for progress.</h1>
      {supabaseConfig() ? <AccountForm /> : <div className="account-card"><h2>Account setup is next.</h2><p>The booking demo is ready to explore. Accounts will be available once this project is connected to Supabase.</p><Link className="button lime" href="/">Explore the demo <span>↗</span></Link></div>}
    </main></>;
}
