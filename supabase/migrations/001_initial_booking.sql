-- Forma initial schema: one fictional coach, explicit published slots.
begin;

create table public.studio_services (
  id text primary key,
  name text not null,
  duration_minutes integer not null check (duration_minutes between 15 and 120),
  price_pence integer not null check (price_pence >= 0),
  active boolean not null default true
);

insert into public.studio_services (id, name, duration_minutes, price_pence) values
  ('strength', 'Strength & technique', 60, 4500),
  ('conditioning', 'Functional conditioning', 45, 3500),
  ('foundation', 'Introduction & goal setting', 30, 0);

create table public.studio_slots (
  id uuid primary key default gen_random_uuid(),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  published boolean not null default true,
  constraint slot_duration check (ends_at = starts_at + interval '60 minutes'),
  constraint studio_slots_no_overlap exclude using gist (
    tstzrange(starts_at, ends_at, '[)') with &&
  )
);

create table public.studio_bookings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  slot_id uuid not null references public.studio_slots(id),
  service_id text not null references public.studio_services(id),
  client_name text not null check (length(btrim(client_name)) between 1 and 80),
  price_pence integer not null check (price_pence >= 0),
  duration_minutes integer not null check (duration_minutes between 15 and 60),
  status text not null default 'confirmed' check (status in ('confirmed', 'cancelled')),
  created_at timestamptz not null default now(),
  cancelled_at timestamptz,
  constraint cancellation_consistent check (
    (status = 'confirmed' and cancelled_at is null) or
    (status = 'cancelled' and cancelled_at is not null)
  )
);

-- The database resolves simultaneous booking attempts, including retries.
create unique index studio_bookings_one_active_slot
  on public.studio_bookings (slot_id) where status = 'confirmed';
create index studio_bookings_user on public.studio_bookings (user_id, created_at desc);

alter table public.studio_services enable row level security;
alter table public.studio_slots enable row level security;
alter table public.studio_bookings enable row level security;

revoke all on public.studio_services, public.studio_slots, public.studio_bookings from anon, authenticated;
grant select on public.studio_services, public.studio_slots, public.studio_bookings to authenticated;

create policy services_read on public.studio_services for select to authenticated using (active);
create policy slots_read on public.studio_slots for select to authenticated using (published);
create policy bookings_owner_read on public.studio_bookings for select to authenticated
  using (user_id = (select auth.uid()));

-- A privacy-preserving availability list. Booking identities are never returned.
create function public.forma_available_slots()
returns table (id uuid, starts_at timestamptz, ends_at timestamptz, available boolean)
language sql stable security definer set search_path = '' as $$
  select s.id, s.starts_at, s.ends_at,
    not exists (
      select 1 from public.studio_bookings b
      where b.slot_id = s.id and b.status = 'confirmed'
    )
  from public.studio_slots s
  where auth.uid() is not null and s.published
    and s.starts_at > now()
    and s.starts_at < now() + interval '28 days'
  order by s.starts_at;
$$;

create function public.forma_book_slot(p_slot_id uuid, p_service_id text, p_client_name text)
returns public.studio_bookings
language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := auth.uid();
  v_slot public.studio_slots;
  v_service public.studio_services;
  v_booking public.studio_bookings;
begin
  if v_user is null then
    raise exception 'Sign in to book a session.' using errcode = '42501';
  end if;
  if p_client_name is null or length(btrim(p_client_name)) not between 1 and 80 then
    raise exception 'Enter a name between 1 and 80 characters.' using errcode = '22023';
  end if;

  -- Serialize booking and cancellation operations for this slot.
  select * into v_slot from public.studio_slots where id = p_slot_id for update;
  if not found or not v_slot.published or v_slot.starts_at <= now()
     or v_slot.starts_at >= now() + interval '28 days' then
    raise exception 'This session time is unavailable.' using errcode = '22023';
  end if;

  select * into v_service from public.studio_services where id = p_service_id and active;
  if not found or v_service.duration_minutes > 60 then
    raise exception 'This service is unavailable.' using errcode = '22023';
  end if;

  select * into v_booking from public.studio_bookings
    where slot_id = p_slot_id and status = 'confirmed';
  if found then
    -- Repeating the same request returns its existing booking without a duplicate.
    if v_booking.user_id = v_user and v_booking.service_id = p_service_id then
      return v_booking;
    end if;
    raise exception 'This time has just been booked. Choose another slot.' using errcode = '23505';
  end if;

  insert into public.studio_bookings
    (user_id, slot_id, service_id, client_name, price_pence, duration_minutes)
    values (v_user, p_slot_id, p_service_id, btrim(p_client_name),
            v_service.price_pence, v_service.duration_minutes)
    returning * into v_booking;
  return v_booking;
end;
$$;

create function public.forma_cancel_booking(p_booking_id uuid)
returns public.studio_bookings
language plpgsql security definer set search_path = '' as $$
declare
  v_booking public.studio_bookings;
  v_slot public.studio_slots;
begin
  if auth.uid() is null then
    raise exception 'Sign in to manage bookings.' using errcode = '42501';
  end if;
  select * into v_booking from public.studio_bookings
    where id = p_booking_id and user_id = auth.uid();
  if not found then
    raise exception 'Booking not found.' using errcode = '42501';
  end if;
  select * into v_slot from public.studio_slots where id = v_booking.slot_id for update;
  select * into v_booking from public.studio_bookings
    where id = p_booking_id and user_id = auth.uid() for update;
  if v_booking.status = 'cancelled' then return v_booking; end if;
  if v_slot.starts_at <= now() then
    raise exception 'A session that has started cannot be cancelled.' using errcode = '22023';
  end if;
  update public.studio_bookings set status = 'cancelled', cancelled_at = now()
    where id = p_booking_id returning * into v_booking;
  return v_booking;
end;
$$;

revoke all on function public.forma_available_slots() from public, anon;
revoke all on function public.forma_book_slot(uuid, text, text) from public, anon;
revoke all on function public.forma_cancel_booking(uuid) from public, anon;
grant execute on function public.forma_available_slots() to authenticated;
grant execute on function public.forma_book_slot(uuid, text, text) to authenticated;
grant execute on function public.forma_cancel_booking(uuid) to authenticated;

-- Demo availability is based on the studio's time zone, independent of the client.
-- Each slot reserves 60 minutes even for a shorter service.
insert into public.studio_slots (starts_at, ends_at)
select (d.day::date + t.session_time) at time zone 'Europe/London',
       ((d.day::date + t.session_time) at time zone 'Europe/London') + interval '60 minutes'
from generate_series(
  ((now() at time zone 'Europe/London')::date + 1)::timestamp,
  ((now() at time zone 'Europe/London')::date + 14)::timestamp,
  interval '1 day'
) as d(day)
cross join (values (time '07:00'), (time '08:30'), (time '10:00'),
                   (time '12:00'), (time '16:00'), (time '17:30')) as t(session_time)
where extract(isodow from d.day) <> 7;

commit;
