-- Apply after 003_trainer_availability.sql.
begin;
create function public.forma_trainer_cancel_booking(p_booking_id uuid)
returns public.studio_bookings
language plpgsql security definer set search_path = '' as $$
declare
  v_booking public.studio_bookings;
  v_slot public.studio_slots;
begin
  if not exists (select 1 from public.studio_trainers where user_id = auth.uid()) then
    raise exception 'Trainer access required.' using errcode = '42501';
  end if;
  select * into v_booking from public.studio_bookings where id = p_booking_id;
  if not found then
    raise exception 'Booking not found.' using errcode = '22023';
  end if;
  -- Use the same lock order as client cancellation, booking and publication changes.
  select * into v_slot from public.studio_slots where id = v_booking.slot_id for update;
  select * into v_booking from public.studio_bookings where id = p_booking_id for update;
  if v_booking.status = 'cancelled' then return v_booking; end if;
  if v_slot.starts_at <= now() then
    raise exception 'A session that has started cannot be cancelled.' using errcode = '22023';
  end if;
  update public.studio_bookings set status = 'cancelled', cancelled_at = now()
    where id = p_booking_id returning * into v_booking;
  return v_booking;
end;
$$;
revoke all on function public.forma_trainer_cancel_booking(uuid) from public, anon;
grant execute on function public.forma_trainer_cancel_booking(uuid) to authenticated;
commit;
