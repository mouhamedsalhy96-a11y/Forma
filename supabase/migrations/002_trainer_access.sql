-- Trainer membership is administrator-managed; signup does not grant access.
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
