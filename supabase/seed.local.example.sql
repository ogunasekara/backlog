-- Copy to supabase/seed.local.sql (gitignored) to allow-list your own emails locally.
insert into public.allowed_emails (email) values
  ('you@example.com')
on conflict do nothing;
