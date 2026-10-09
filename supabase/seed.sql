-- Local development seed (applied by `supabase db reset`).
-- Put your own emails in supabase/seed.local.sql (gitignored; see seed.local.example.sql).
-- In production, manage allowed_emails in the dashboard.
insert into public.allowed_emails (email) values
  ('dev@example.com')
on conflict do nothing;
