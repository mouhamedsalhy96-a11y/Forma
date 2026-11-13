import Link from "next/link";
import { supabaseConfig } from "@/lib/supabase/config";
import RecoveryForm from "./recovery-form";

export default function ForgotPasswordPage() {
  return <>
    <div className="demo-bar">Forma · Account recovery</div>
    <header className="header"><Link className="wordmark" href="/">forma<span>®</span></Link><Link href="/account" className="text-link">Back to sign in</Link></header>
    <main className="section account-section"><div className="eyebrow">A FRESH START</div><h1 className="page-title">Forgot your password?</h1>
      {supabaseConfig() ? <RecoveryForm /> : <p className="notice">Account recovery is awaiting connection setup.</p>}
    </main>
  </>;
}
