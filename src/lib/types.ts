/** Types mirroring the database enums and the edge function payloads. */

export type MediaType = 'movie' | 'tv' | 'book' | 'game'
export type MediaSource = 'tmdb' | 'igdb' | 'google_books' | 'custom'
export type CatalogSource = Exclude<MediaSource, 'custom'>
export type EntryStatus = 'backlog' | 'in_progress' | 'completed' | 'on_hold' | 'dropped'

export const MEDIA_TYPES: MediaType[] = ['movie', 'tv', 'book', 'game']
export const ENTRY_STATUSES: EntryStatus[] = [
  'backlog',
  'in_progress',
  'completed',
  'on_hold',
  'dropped',
]

export type SearchScope = MediaType | 'all'

/** A hit from the `search` edge function. */
export type SearchResult = {
  type: MediaType
  source: CatalogSource
  externalId: string
  title: string
  year?: number
  coverUrl?: string
  blurb?: string
}

export type SourceError = { source: CatalogSource; type: MediaType; message: string }

export type SearchResponse = { results: SearchResult[]; errors?: SourceError[] }

export type Media = {
  id: string
  type: MediaType
  source: MediaSource
  external_id: string | null
  title: string
  year: number | null
  description: string | null
  cover_url: string | null
  details: Record<string, unknown>
  created_by: string | null
  fetched_at: string
}

export type Entry = {
  id: string
  user_id: string
  media_id: string
  status: EntryStatus
  rating: number | null
  notes: string
  started_on: string | null
  finished_on: string | null
  progress_percent: number | null
  progress_pages: number | null
  tv_season: number
  tv_episode: number
  backlog_position: string | null
  created_at: string
  updated_at: string
}

/** An entry with its media row joined in, as the library screen reads it. */
export type EntryWithMedia = Entry & { media: Media }
