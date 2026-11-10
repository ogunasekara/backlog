-- The library's "Last updated" sort reads entries.updated_at. Moving an entry within
-- the backlog isn't a change to the entry, so a write that changes only backlog_position
-- leaves updated_at alone. A status change that also sets or clears the position still
-- counts, because the status differs. Comparing the whole row minus those two columns
-- means columns added later count as updates without touching this trigger.

drop trigger entries_set_updated_at on public.entries;

create trigger entries_set_updated_at
  before update on public.entries
  for each row
  when (
    (to_jsonb(old) - 'backlog_position' - 'updated_at')
    is distinct from
    (to_jsonb(new) - 'backlog_position' - 'updated_at')
  )
  execute function public.set_updated_at();
