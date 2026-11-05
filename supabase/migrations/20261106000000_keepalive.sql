-- Pinged by .github/workflows/keepalive.yml so the free-tier project isn't paused for
-- inactivity. Anon can't read any table, so it gets this one harmless function: a real
-- query that touches no data.
create function public.keepalive()
returns integer
language sql
stable
set search_path = ''
as $$
  select 1;
$$;

revoke execute on function public.keepalive() from public;
grant execute on function public.keepalive() to anon, authenticated;
