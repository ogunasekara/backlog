-- Backlog: initial schema (Phase 1).
-- Tables: media (shared catalog), entries (per-user tracking), allowed_emails (sign-up allow-list).

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------

create type public.media_type as enum ('movie', 'tv', 'book', 'game');
create type public.media_source as enum ('tmdb', 'igdb', 'google_books', 'custom');
create type public.entry_status as enum ('backlog', 'in_progress', 'completed', 'on_hold', 'dropped');

-- ---------------------------------------------------------------------------
-- updated_at trigger helper
-- ---------------------------------------------------------------------------

create function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- media: shared metadata catalog
-- ---------------------------------------------------------------------------

create table public.media (
  id uuid primary key default gen_random_uuid(),
  type public.media_type not null,
  source public.media_source not null,
  external_id text,
  title text not null check (length(trim(title)) > 0),
  year smallint check (year between 1000 and 9999),
  description text,
  cover_url text,
  details jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users (id) on delete cascade,
  fetched_at timestamptz not null default now(),

  -- Custom items have no external id and are owned by their creator;
  -- catalog items always have an external id and no owner.
  constraint media_source_identity check (
    (source = 'custom' and external_id is null and created_by is not null)
    or (source <> 'custom' and external_id is not null and created_by is null)
  )
);

create unique index media_source_external_id_key
  on public.media (source, external_id)
  where source <> 'custom';

create index media_created_by_idx on public.media (created_by) where created_by is not null;

-- ---------------------------------------------------------------------------
-- entries: one per user per media item
-- ---------------------------------------------------------------------------

create table public.entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  media_id uuid not null references public.media (id) on delete cascade,
  status public.entry_status not null default 'backlog',
  rating smallint check (rating between 1 and 10),
  notes text not null default '',
  started_on date,
  finished_on date,
  progress_percent smallint check (progress_percent between 0 and 100),
  progress_pages integer check (progress_pages >= 0),
  tv_season integer not null default 1 check (tv_season >= 1),
  tv_episode integer not null default 0 check (tv_episode >= 0),
  backlog_position text collate "C",
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint entries_user_media_key unique (user_id, media_id),
  -- Only backlog entries have a position in the ordered backlog.
  constraint entries_backlog_position_iff_backlog check (
    (backlog_position is not null) = (status = 'backlog')
  )
);

create index entries_user_status_position_idx
  on public.entries (user_id, status, backlog_position);

create index entries_media_id_idx on public.entries (media_id);

create trigger entries_set_updated_at
  before update on public.entries
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- allowed_emails: sign-up allow-list, managed by hand in the dashboard
-- ---------------------------------------------------------------------------

create table public.allowed_emails (
  email text primary key check (email = lower(email))
);

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------

alter table public.media enable row level security;
alter table public.entries enable row level security;
alter table public.allowed_emails enable row level security;

-- entries: owner-only access.
create policy "entries_select_own" on public.entries
  for select to authenticated
  using (user_id = (select auth.uid()));

-- The media subquery runs under media RLS, so entries can only point at visible media.
create policy "entries_insert_own" on public.entries
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (select 1 from public.media m where m.id = media_id)
  );

create policy "entries_update_own" on public.entries
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (
    user_id = (select auth.uid())
    and exists (select 1 from public.media m where m.id = media_id)
  );

create policy "entries_delete_own" on public.entries
  for delete to authenticated
  using (user_id = (select auth.uid()));

-- media: catalog rows are visible to everyone signed in; custom rows only to their creator.
-- Catalog rows are written by edge functions using the service role (bypasses RLS).
create policy "media_select_catalog_or_own" on public.media
  for select to authenticated
  using (created_by is null or created_by = (select auth.uid()));

create policy "media_insert_custom" on public.media
  for insert to authenticated
  with check (source = 'custom' and created_by = (select auth.uid()));

create policy "media_update_custom" on public.media
  for update to authenticated
  using (source = 'custom' and created_by = (select auth.uid()))
  with check (source = 'custom' and created_by = (select auth.uid()));

create policy "media_delete_custom" on public.media
  for delete to authenticated
  using (source = 'custom' and created_by = (select auth.uid()));

-- allowed_emails: RLS enabled with no policies, plus explicit revokes = no client access.
revoke all on public.allowed_emails from anon, authenticated;

-- Anonymous users never touch app data.
revoke all on public.media, public.entries from anon;

-- ---------------------------------------------------------------------------
-- Auth hook: reject sign-ups that are not on the allow-list
-- ---------------------------------------------------------------------------

create function public.hook_before_user_created(event jsonb)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  user_email text := lower(event -> 'user' ->> 'email');
begin
  if user_email is not null
     and exists (select 1 from public.allowed_emails where email = user_email) then
    return '{}'::jsonb;
  end if;

  return jsonb_build_object(
    'error', jsonb_build_object(
      'http_code', 403,
      'message', 'This email is not allowed to sign up for Backlog.'
    )
  );
end;
$$;

grant usage on schema public to supabase_auth_admin;
grant execute on function public.hook_before_user_created(jsonb) to supabase_auth_admin;
revoke execute on function public.hook_before_user_created(jsonb) from authenticated, anon, public;
grant select on table public.allowed_emails to supabase_auth_admin;

-- The hook runs as supabase_auth_admin, which needs to read the allow-list through RLS.
create policy "allowed_emails_auth_admin_read" on public.allowed_emails
  for select to supabase_auth_admin
  using (true);
