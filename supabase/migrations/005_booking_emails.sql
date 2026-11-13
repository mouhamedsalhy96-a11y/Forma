-- Apply after 004_trainer_cancellation.sql. Stores future email events atomically
-- with booking changes. Existing bookings are not emailed retrospectively.
begin;

create table public.studio_email_outbox (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.studio_bookings(id) on delete cascade,
  event text not null check (event in ('confirmed', 'cancelled')),
  recipient text not null,
  subject text not null,
  body_text text not null,
  status text not null default 'pending' check (status in ('pending', 'processing', 'sent', 'skipped', 'failed')),
  attempts integer not null default 0,
  created_at timestamptz not null default now(),
  first_attempt_at timestamptz,
  next_attempt_at timestamptz not null default now(),
  lease_until timestamptz,
  claim_token uuid,
  delivery_from text,
  delivery_to text,
  delivery_subject text,
  provider_id text,
  sent_at timestamptz,
  last_error text,
  unique (booking_id, event)
);
alter table public.studio_email_outbox enable row level security;
revoke all on public.studio_email_outbox from public, anon, authenticated;
grant select, update on public.studio_email_outbox to service_role;
create index studio_email_pending on public.studio_email_outbox (next_attempt_at)
  where status in ('pending', 'processing');

create function public.forma_queue_booking_email()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_email text;
  v_service text;
  v_start timestamptz;
  v_subject text;
  v_text text;
begin
  if tg_op = 'UPDATE' and new.status is not distinct from old.status then return new; end if;
  select email into v_email from auth.users where id = new.user_id;
  if v_email is null or btrim(v_email) = '' then return new; end if;
  select name into v_service from public.studio_services where id = new.service_id;
  select starts_at into v_start from public.studio_slots where id = new.slot_id;
  v_subject := case when new.status = 'confirmed' then 'Your Forma session is confirmed' else 'Your Forma session has been cancelled' end;
  v_text := 'Hi ' || new.client_name || E',\n\n' ||
    case when new.status = 'confirmed' then 'Your session is booked.' else 'Your session has been cancelled.' end ||
    E'\n\nSession: ' || v_service ||
    E'\nDate: ' || to_char(v_start at time zone 'Europe/London', 'FMDay, DD FMMonth YYYY') ||
    E'\nStart time: ' || to_char(v_start at time zone 'Europe/London', 'HH24:MI') || ' (Europe/London)' ||
    E'\nDuration: ' || new.duration_minutes || ' minutes' ||
    E'\nSession price: GBP ' || to_char(new.price_pence::numeric / 100, 'FM999999990.00') ||
    E'\n\nThis is a Forma portfolio test booking. No payment has been collected.' ||
    E'\nManage your sessions in Forma under My bookings.' ||
    E'\n\nForma';
  insert into public.studio_email_outbox (booking_id, event, recipient, subject, body_text)
    values (new.id, new.status, v_email, v_subject, v_text)
    on conflict (booking_id, event) do nothing;
  return new;
end;
$$;
revoke all on function public.forma_queue_booking_email() from public, anon, authenticated;
create trigger studio_booking_email
  after insert or update of status on public.studio_bookings
  for each row execute function public.forma_queue_booking_email();

-- Called only by the server. Leases prevent simultaneous workers sending the same
-- event. Retry keys remain inside Resend's 24-hour idempotency retention.
create function public.forma_claim_booking_emails(p_booking_id uuid, p_from text, p_test_to text)
returns setof public.studio_email_outbox
language plpgsql security definer set search_path = '' as $$
begin
  if p_from is null or btrim(p_from) = '' then raise exception 'Sender required.'; end if;
  update public.studio_email_outbox o set status = 'skipped', lease_until = null
    where (o.status = 'pending' or (o.status = 'processing' and o.lease_until < now())) and o.event = 'confirmed'
      and (p_booking_id is null or o.booking_id = p_booking_id)
      and exists (select 1 from public.studio_bookings b where b.id = o.booking_id and b.status = 'cancelled');
  update public.studio_email_outbox o set status = 'failed', last_error = 'Retry window expired', lease_until = null
    where (p_booking_id is null or o.booking_id = p_booking_id)
      and o.status in ('pending', 'processing')
      and (o.lease_until is null or o.lease_until < now())
      and (o.created_at < now() - interval '24 hours'
        or o.first_attempt_at < now() - interval '23 hours' or o.attempts >= 5);
  return query
    with candidates as (
      select o.id from public.studio_email_outbox o
      where (p_booking_id is null or o.booking_id = p_booking_id)
        and o.status in ('pending', 'processing') and o.attempts < 5
        and o.next_attempt_at <= now()
        and (o.lease_until is null or o.lease_until < now())
      order by o.created_at, o.id for update skip locked limit 3
    )
    update public.studio_email_outbox o set
      status = 'processing', attempts = o.attempts + 1,
      first_attempt_at = coalesce(o.first_attempt_at, now()),
      lease_until = now() + interval '2 minutes', claim_token = gen_random_uuid(),
      delivery_from = coalesce(o.delivery_from, p_from),
      delivery_to = coalesce(o.delivery_to, nullif(btrim(p_test_to), ''), o.recipient),
      delivery_subject = coalesce(o.delivery_subject,
        case when nullif(btrim(p_test_to), '') is not null then '[TEST] ' else '' end || o.subject)
    from candidates c where c.id = o.id returning o.*;
end;
$$;
revoke all on function public.forma_claim_booking_emails(uuid, text, text) from public, anon, authenticated;
grant execute on function public.forma_claim_booking_emails(uuid, text, text) to service_role;

commit;
