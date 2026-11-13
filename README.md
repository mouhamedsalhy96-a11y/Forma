# Forma

A booking portal for an independent personal trainer, with a client account area and a protected trainer workspace.

## What it does

Clients can create an account, choose a service and studio time, book a session, view their history and cancel a future booking. Trainers can search bookings, publish or hide availability and cancel client sessions.

The interface includes a shared calendar, quarter-hour time selection and mobile layouts. Session times use Europe/London. The database enforces one active booking per slot and preserves cancelled-session history.

Confirmation and cancellation emails are recorded in a private queue. A server-only Resend integration sends them with bounded retries and stable idempotency keys.

## Project status

Forma is a portfolio prototype for a fictional trainer. Payments are not enabled.

Local booking, trainer availability, cancellation, account recovery and test email delivery have been checked. Email testing uses Resend's test sender and redirects notifications to the configured test inbox. Sending to clients requires a verified sender domain.

## Stack

Next.js · React · TypeScript · Tailwind CSS · Supabase Auth · PostgreSQL · Resend

## Development

Copy .env.example to .env.local, configure the separate Supabase project and install dependencies with npm install. Run npm run dev and open its printed URL.

Apply the SQL files in supabase/migrations in numerical order once per database. Use new migrations for later changes. The initial migration seeds 14 days of studio slots.

Commands:

- npm run lint — source checks.
- npm test — disposable PostgreSQL permission and booking checks, plus mocked email-provider tests.
- npm run build — production build.

The tests use a minimal Supabase Auth identity stub. Real authentication, email inbox delivery and multi-connection concurrency require separate live verification.

## Deployment

See [Vercel deployment](docs/deployment.md) and [booking email setup](docs/booking-emails.md).

Environment values belong in the host's environment manager. The Supabase secret, Resend key and scheduler secret are server-only.

## Photography

Studio photo from [Unsplash](https://unsplash.com), stored in public/images/studio.jpg.
