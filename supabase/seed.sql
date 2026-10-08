-- Local development seed (applied by `supabase db reset`).
-- Add the emails you sign in with locally. In production, manage allowed_emails in the dashboard.
insert into public.allowed_emails (email) values
  ('dev@example.com')
on conflict do nothing;
