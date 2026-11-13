import { NextRequest, NextResponse } from "next/server";
import { serverSupabase } from "@/lib/supabase/server";
import { supabaseConfig } from "@/lib/supabase/config";

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  // Accept only the fixed recovery destination, never arbitrary redirect URLs.
  const destination = request.nextUrl.searchParams.get("next") === "/account/reset-password" ? "/account/reset-password" : "/account";
  if (code && supabaseConfig()) {
    try {
      const client = await serverSupabase();
      const { error } = await client.auth.exchangeCodeForSession(code);
      if (!error) return NextResponse.redirect(new URL(destination, request.url), {
        headers: { "Cache-Control": "private, no-store" },
      });
    } catch { /* Return an actionable error without exposing provider details. */ }
  }
  return NextResponse.redirect(new URL(destination === "/account/reset-password" ? "/account/forgot-password" : "/account?confirmation=failed", request.url), {
    headers: { "Cache-Control": "private, no-store" },
  });
}
