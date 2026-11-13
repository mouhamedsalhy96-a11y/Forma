-- Run after 001_initial_booking.sql. Trainer membership is assigned only via SQL.
begin;
create table public.studio_trainers (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.studio_trainers enable row level security;
revoke all on public.studio_trainers from anon, authenticated;
grant select on public.studio_trainers to authenticated;
create policy trainer_membership_self on public.studio_trainers
  for select to authenticated using (user_id = (select auth.uid()));

-- This separate policy adds access for verified trainers, preserving owner reads.
create policy bookings_trainer_read on public.studio_bookings
  for select to authenticated using (
    exists (select 1 from public.studio_trainers where user_id = (select auth.uid()))
  );
create policy slots_trainer_read on public.studio_slots
  for select to authenticated using (
    exists (select 1 from public.studio_trainers where user_id = (select auth.uid()))
  );
create policy services_trainer_read on public.studio_services
  for select to authenticated using (
    exists (select 1 from public.studio_trainers where user_id = (select auth.uid()))
  );
commit;

-- After this migration, assign your existing test account in a SEPARATE query:
-- insert into public.studio_trainers (user_id)
-- select id from auth.users where email = 'REPLACE_WITH_YOUR_ACCOUNT_EMAIL'
-- on conflict (user_id) do nothing;
-- Confirm one row was inserted. Signing up never grants trainer membership.
