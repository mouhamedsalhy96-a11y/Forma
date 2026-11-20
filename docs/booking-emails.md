# Booking email setup

## Configuration

The email outbox is introduced by migration `005_booking_emails.sql`, after migrations 001–004. Delivery uses these server-only settings:

| Variable | Purpose |
| --- | --- |
| `SUPABASE_SECRET_KEY` | Supabase secret key or legacy service-role key |
| `RESEND_API_KEY` | Resend sending key |
| `FORMA_EMAIL_FROM` | Sender identity; test sender is `Forma <onboarding@resend.dev>` |
| `FORMA_EMAIL_MODE` | `test` redirects notifications; `live` sends to clients |
| `FORMA_EMAIL_TEST_TO` | Resend account inbox for test delivery |

The test sender can email only the address associated with the Resend account. Every test notification is redirected to `FORMA_EMAIL_TEST_TO` and its subject starts with `[TEST]`. Supabase authentication emails use separate Supabase settings.

Email credentials remain server-only and are excluded from version control. Delivery verification uses a new fictional booking and cancellation, with provider status and inbox receipt checked independently.

## Queue and retries

The booking transaction records an immutable confirmation event. Cancellation records a separate event. Existing bookings are not backfilled. An unsent confirmation is skipped if the booking has already been cancelled.

After the booking is saved, a same-origin endpoint verifies the caller's account and booking visibility, then processes the associated email events after returning its response. The browser never supplies the recipient, sender or email body. Booking success does not depend on provider availability.

A private queue stores delivery attempts. The worker leases up to three events and uses an event-specific Resend idempotency key. A provider timeout or rejection leaves the event available for retry after 60 seconds, for up to five attempts within the provider's deduplication window. The exact sender, recipient, subject and text are retained across retries. The sent status means provider acceptance, not proof of inbox delivery.

Trainer bookings have a Retry email updates button. For automatic retries after deployment, configure a scheduler to GET /api/notifications/deliver with Authorization: Bearer CRON_SECRET. Set a long random CRON_SECRET on the server. No schedule is provisioned automatically in this project.

If the browser closes before requesting delivery, the queued event remains for the scheduler or the trainer retry action. A schedule is required for unattended retries. Review jobs older than 24 hours or with exhausted attempts manually before resending.

In Supabase SQL Editor, inspect delivery status without exposing message contents:

    select id, booking_id, event, status, attempts, last_error, created_at
    from public.studio_email_outbox
    order by created_at desc
    limit 20;

## Client delivery

Verify a domain in Resend, set FORMA_EMAIL_FROM to an address on that domain, and deliberately change FORMA_EMAIL_MODE to live. In live mode messages go to the booking owner's account email.

Events already attempted in test mode retain their test recipient on retry. Create a new booking to test the new delivery configuration. Keep using fictional client details until the app is ready for real bookings.

## Validation

npm test exercises queue privacy, event uniqueness, cancelled-confirmation suppression, leases, retry payload stability, bounded retries and mocked Resend responses. No test sends a real email. A live inbox test is required after configuring the provider.
