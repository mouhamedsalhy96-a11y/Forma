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

Next.js Â· React Â· TypeScript Â· Tailwind CSS Â· Supabase Auth Â· PostgreSQL Â· Resend

## Project links

- [Live demonstration](https://forma-khaki-ten.vercel.app/)
- [Source repository](https://github.com/mouhamedsalhy96-a11y/Forma)

## Verification

`npm run lint` checks the source; `npm test` covers booking permissions and mocked email-provider behavior; `npm run build` produces the deployment build.

Database tests use a minimal Supabase Auth identity stub. Real authentication, inbox delivery and multi-connection concurrency require separate live verification.

## Deployment

See [Vercel deployment](docs/deployment.md) and [booking email setup](docs/booking-emails.md).

Environment values belong in the host's environment manager. The Supabase secret, Resend key and scheduler secret are server-only.

## Photography

Studio photo from [Unsplash](https://unsplash.com), stored in public/images/studio.jpg.
