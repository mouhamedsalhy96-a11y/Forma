-- Apply after 002_trainer_access.sql.
begin;

-- Clients retain session times in their booking history when an empty slot is hidden.
create policy slots_owner_history_read on public.studio_slots
for select to authenticated using (
  exists (
    select 1 from public.studio_bookings b
    where b.slot_id = studio_slots.id and b.user_id = (select auth.uid())
  )
);

create function public.forma_trainer_slots()
returns table (id uuid, starts_at timestamptz, ends_at timestamptz, published boolean, booked boolean)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.studio_trainers where user_id = auth.uid()) then
    raise exception 'Trainer access required.' using errcode = '42501';
  end if;
  return query
    select s.id, s.starts_at, s.ends_at, s.published,
      exists (select 1 from public.studio_bookings b where b.slot_id = s.id and b.status = 'confirmed')
    from public.studio_slots s
    where s.starts_at > now() and s.starts_at < now() + interval '28 days'
    order by s.starts_at;
end;
$$;

create function public.forma_publish_slot(p_day date, p_time time)
returns public.studio_slots
language plpgsql security definer set search_path = '' as $$
declare
  v_start timestamptz;
  v_slot public.studio_slots;
begin
  if not exists (select 1 from public.studio_trainers where user_id = auth.uid()) then
    raise exception 'Trainer access required.' using errcode = '42501';
  end if;
  if p_day is null or p_time is null
    or p_time < time '06:00' or p_time > time '20:00'
    or extract(second from p_time) <> 0
    or mod(extract(minute from p_time)::integer, 15) <> 0 then
    raise exception 'Choose a quarter-hour start between 06:00 and 20:00.' using errcode = '22023';
  end if;
  v_start := (p_day + p_time) at time zone 'Europe/London';
  if v_start <= now() or v_start >= now() + interval '28 days' then
    raise exception 'Choose a future time within the next 28 days.' using errcode = '22023';
  end if;
  insert into public.studio_slots(starts_at, ends_at)
    values (v_start, v_start + interval '60 minutes') returning * into v_slot;
  return v_slot;
end;
$$;

create function public.forma_set_slot_published(p_slot_id uuid, p_published boolean)
returns public.studio_slots
language plpgsql security definer set search_path = '' as $$
declare v_slot public.studio_slots;
begin
  if not exists (select 1 from public.studio_trainers where user_id = auth.uid()) then
    raise exception 'Trainer access required.' using errcode = '42501';
  end if;
  if p_published is null then
    raise exception 'Choose a publication status.' using errcode = '22023';
  end if;
  -- Booking and cancellation functions lock the same slot, serializing changes.
  select * into v_slot from public.studio_slots where id = p_slot_id for update;
  if not found or v_slot.starts_at <= now() then
    raise exception 'This slot is unavailable for changes.' using errcode = '22023';
  end if;
  if not p_published and exists (
    select 1 from public.studio_bookings where slot_id = p_slot_id and status = 'confirmed'
  ) then
    raise exception 'A booked slot cannot be hidden.' using errcode = '22023';
  end if;
  update public.studio_slots set published = p_published where id = p_slot_id returning * into v_slot;
  return v_slot;
end;
$$;

revoke all on function public.forma_trainer_slots() from public, anon;
revoke all on function public.forma_publish_slot(date, time) from public, anon;
revoke all on function public.forma_set_slot_published(uuid, boolean) from public, anon;
grant execute on function public.forma_trainer_slots() to authenticated;
grant execute on function public.forma_publish_slot(date, time) to authenticated;
grant execute on function public.forma_set_slot_published(uuid, boolean) to authenticated;

commit;
