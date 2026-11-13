import { after, NextRequest, NextResponse } from "next/server";
import { serverSupabase } from "@/lib/supabase/server";
import { emailDeliveryConfigured, processBookingEmails } from "@/lib/email/process";


export const maxDuration = 60;
const headers = { "Cache-Control": "private, no-store" };

export async function POST(request: NextRequest) {
  let sameOrigin = false;
  try {
    const origin = new URL(request.headers.get("origin") || "");
    sameOrigin = origin.host === request.headers.get("host") &&
      origin.protocol === request.nextUrl.protocol;
  } catch { /* A missing or malformed browser origin is rejected. */ }
  if (!sameOrigin) {
    return NextResponse.json({ error: "Same-origin requests only." }, { status: 403, headers });
  }
  let bookingId: string;
  try {
    const text = await request.text();
    if (text.length > 512) throw new Error("Invalid request");
    const body = JSON.parse(text);
    if (typeof body.bookingId !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(body.bookingId)) throw new Error("Invalid booking");
    bookingId = body.bookingId;
  } catch { return NextResponse.json({ error: "A booking ID is required." }, { status: 400, headers }); }
  try {
    const client = await serverSupabase();
    const { data: auth, error: authError } = await client.auth.getUser();
    if (authError || !auth.user) return NextResponse.json({ error: "Sign in required." }, { status: 401, headers });
    // RLS restricts this lookup to the booking owner or a trainer.
    const { data, error } = await client.from("studio_bookings").select("id").eq("id", bookingId).maybeSingle();
    if (error) return NextResponse.json({ error: "Booking could not be checked." }, { status: 503, headers });
    if (!data) return NextResponse.json({ error: "Booking not found." }, { status: 404, headers });
    if (!emailDeliveryConfigured()) return NextResponse.json({ status: "awaiting_setup" }, { headers });
    after(async () => {
      try { await processBookingEmails(bookingId); }
      catch { console.error("Booking notification processing failed; event remains queued for retry."); }
    });
    return NextResponse.json({ status: "queued" }, { status: 202, headers });
  } catch { return NextResponse.json({ error: "Notification service unavailable." }, { status: 503, headers }); }
}

// A scheduler can call this endpoint after deployment. No schedule is installed here.
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ error: "Scheduler not configured." }, { status: 503, headers });
  if (request.headers.get("authorization") !== "Bearer " + secret) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401, headers });
  }
  try {
    const result = await processBookingEmails(null);
    return NextResponse.json(result, { headers });
  } catch { return NextResponse.json({ error: "Queue processing failed." }, { status: 503, headers }); }
}
