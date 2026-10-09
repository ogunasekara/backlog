import { generateKeyBetween } from 'fractional-indexing'
import { supabase } from '@/lib/supabase'
import type { Entry, EntryStatus, EntryWithMedia, Media, MediaType } from '@/lib/types'

/** Postgres unique_violation: one entry per user per media item. */
const UNIQUE_VIOLATION = '23505'

export class DuplicateEntryError extends Error {
  readonly entryId: string | null

  constructor(entryId: string | null) {
    super('This is already in your library.')
    this.name = 'DuplicateEntryError'
    this.entryId = entryId
  }
}

export type BacklogPlacement = 'top' | 'bottom'

/**
 * Computes a fractional index for a new backlog entry. Only the new row is written;
 * its neighbours keep their positions. Ordering uses the C collation server-side so
 * Postgres and `fractional-indexing` agree on how the keys compare.
 */
export async function nextBacklogPosition(placement: BacklogPlacement): Promise<string> {
  const { data, error } = await supabase
    .from('entries')
    .select('backlog_position')
    .eq('status', 'backlog')
    .order('backlog_position', { ascending: placement === 'top' })
    .limit(1)
  if (error) throw error

  const edge = data?.[0]?.backlog_position ?? null
  return placement === 'top' ? generateKeyBetween(null, edge) : generateKeyBetween(edge, null)
}

export type AddEntryInput = {
  mediaId: string
  status: EntryStatus
  placement?: BacklogPlacement
}

/**
 * Creates an entry for an already-upserted media row. Throws DuplicateEntryError
 * (carrying the existing entry's id) when the item is already in the library.
 */
export async function addEntry({
  mediaId,
  status,
  placement = 'bottom',
}: AddEntryInput): Promise<Entry> {
  const backlog_position = status === 'backlog' ? await nextBacklogPosition(placement) : null

  const { data, error } = await supabase
    .from('entries')
    .insert({ media_id: mediaId, status, backlog_position })
    .select()
    .single()

  if (error) {
    if (error.code === UNIQUE_VIOLATION) throw new DuplicateEntryError(await findEntryId(mediaId))
    throw error
  }
  return data as Entry
}

export async function findEntryId(mediaId: string): Promise<string | null> {
  const { data } = await supabase.from('entries').select('id').eq('media_id', mediaId).maybeSingle()
  return data?.id ?? null
}

export type CustomMediaInput = {
  type: MediaType
  title: string
  year: number | null
  description: string | null
  coverUrl: string | null
}

/** Custom items are written straight to `media`; RLS fills in and checks the owner. */
export async function createCustomMedia(input: CustomMediaInput): Promise<Media> {
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new Error('You are signed out.')

  const { data, error } = await supabase
    .from('media')
    .insert({
      type: input.type,
      source: 'custom',
      external_id: null,
      title: input.title,
      year: input.year,
      description: input.description,
      cover_url: input.coverUrl,
      details: {},
      created_by: user.id,
    })
    .select()
    .single()

  if (error) throw error
  return data as Media
}

export async function listEntries(): Promise<EntryWithMedia[]> {
  const { data, error } = await supabase
    .from('entries')
    .select('*, media(*)')
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data ?? []) as EntryWithMedia[]
}
