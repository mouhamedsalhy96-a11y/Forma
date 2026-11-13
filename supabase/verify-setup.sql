-- Run after 001_initial_booking.sql. Read-only setup inspection.
select table_name, rowsecurity as rls_enabled
from pg_tables
cross join lateral (select tablename as table_name) names
where schemaname = 'public'
  and tablename in ('studio_services', 'studio_slots', 'studio_bookings')
order by table_name;

select id, name, duration_minutes, price_pence from public.studio_services order by id;
select count(*) as published_slots from public.studio_slots where published and starts_at > now();

select
  not has_table_privilege('anon', 'public.studio_bookings', 'SELECT') as anonymous_bookings_blocked,
  not has_table_privilege('authenticated', 'public.studio_bookings', 'INSERT') as direct_booking_insert_blocked,
  not has_table_privilege('authenticated', 'public.studio_bookings', 'UPDATE') as direct_booking_update_blocked,
  not has_function_privilege('anon', 'public.forma_book_slot(uuid,text,text)', 'EXECUTE') as anonymous_booking_blocked,
  has_function_privilege('authenticated', 'public.forma_book_slot(uuid,text,text)', 'EXECUTE') as authenticated_booking_enabled;
