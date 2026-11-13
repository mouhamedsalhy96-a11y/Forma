import Link from "next/link";
import { supabaseConfig } from "@/lib/supabase/config";
import ResetPasswordForm from "./reset-password-form";

export default function ResetPasswordPage() {
  return <>
    <div className="demo-bar">Forma · Account recovery</div>
    <header className="header"><Link className="wordmark" href="/">forma<span>®</span></Link><Link href="/account" className="text-link">Account</Link></header>
    <main className="section account-section"><div className="eyebrow">YOUR ACCOUNT</div><h1 className="page-title">Set your new password.</h1>
      {supabaseConfig() ? <ResetPasswordForm /> : <p className="notice">Account recovery is awaiting connection setup.</p>}
    </main>
  </>;
}
