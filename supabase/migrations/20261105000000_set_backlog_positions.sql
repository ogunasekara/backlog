-- Phase 5: reordering inside a type tab keeps each type in the backlog slots it already
-- holds, so one drag can give several entries new positions (two shows swapping slots,
-- for example). This writes them in one statement, so a reorder can't half-apply.
--
-- Runs as the caller (security invoker): RLS limits it to their own entries, and the
-- backlog_position check constraint still rejects a position on a non-backlog entry.
-- If any id isn't updated (another user's, deleted meanwhile, or repeated), the whole
-- call fails and nothing changes.

create function public.set_backlog_positions(positions jsonb)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  updated integer;
begin
  update public.entries as e
  set backlog_position = p.position
  from jsonb_to_recordset(positions) as p (id uuid, position text)
  where e.id = p.id;

  get diagnostics updated = row_count;
  if updated <> jsonb_array_length(positions) then
    raise exception 'Expected to reorder % backlog entries, found %',
      jsonb_array_length(positions), updated
      using errcode = 'P0002';
  end if;
end;
$$;

revoke execute on function public.set_backlog_positions(jsonb) from public, anon;
grant execute on function public.set_backlog_positions(jsonb) to authenticated;
