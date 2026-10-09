-- The catalog uniqueness index was partial (`where source <> 'custom'`). Postgres can only
-- infer a partial index for `on conflict` when the statement repeats its predicate, which
-- supabase-js upsert cannot express. A plain unique index behaves identically here:
-- custom rows always have a null `external_id` (enforced by media_source_identity), and
-- nulls are distinct in a unique index, so any number of custom rows still coexist.

drop index if exists public.media_source_external_id_key;

create unique index media_source_external_id_key on public.media (source, external_id);
