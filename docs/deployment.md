# Vercel deployment

## Import the repository

Import the Forma GitHub repository into Vercel. Use the Next.js preset and the repository root. Leave the build and output settings at their framework defaults.

## Environment

The production environment requires:

- NEXT_PUBLIC_SUPABASE_URL
- NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
- SUPABASE_SECRET_KEY
- RESEND_API_KEY
- FORMA_EMAIL_FROM
- FORMA_EMAIL_MODE
- FORMA_EMAIL_TEST_TO

Keep FORMA_EMAIL_MODE=test while using onboarding@resend.dev. FORMA_EMAIL_TEST_TO must match the Resend account email. Test mode redirects every booking email to that inbox.

SUPABASE_SECRET_KEY and RESEND_API_KEY must never have NEXT_PUBLIC_ prefixes. They are excluded from version control and browser code. Local .env.local is ignored by Git.

Do not enable these email credentials on untrusted preview deployments connected to production customer data. Use a separate test Supabase project for such previews.

## Supabase redirects

After Vercel provides the production URL, set Supabase Authentication's Site URL to it. Add these allowed redirects, replacing the example origin:

- https://YOUR-SITE.vercel.app/auth/callback
- https://YOUR-SITE.vercel.app/auth/callback?next=/account/reset-password

Retain exact localhost redirects if local development still needs them. Migrations 001 through 005 are applied once per database, in order.

## Verify the deployed app

Use fictional data:

1. Sign in and publish a future slot as the trainer.
2. Book it from a client account and refresh the page.
3. Confirm its email arrives at the configured test inbox.
4. Try booking the occupied time from a second client.
5. Cancel the session, check its history and confirm its cancellation email.
6. Request a password reset and complete it on the deployed origin.
7. Confirm an ordinary client cannot access the trainer workspace.

## Notification retries

Booking changes request delivery immediately. Failed requests remain in the private outbox. Trainers can request another attempt through Retry email updates.

Unattended retries require a scheduler. The authenticated worker endpoint is GET /api/notifications/deliver and accepts Authorization: Bearer CRON_SECRET. Choose a long, random scheduler secret, store it server-side and configure a frequent scheduler after deployment.

Vercel Hobby's legacy cron configuration permits only daily execution. That interval is unsuitable for the outbox's retry and expiry windows. No daily cron is added to this project. Use a compatible frequent scheduler or a hosting plan that supports it before relying on unattended delivery.

References:
- https://vercel.com/docs/schedules/cron-jobs/usage-and-pricing
- https://vercel.com/docs/schedules/cron-jobs/manage-cron-jobs
