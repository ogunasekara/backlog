import type { EntryStatus, MediaType, SearchScope } from '@/lib/types'

export const MEDIA_TYPE_LABELS: Record<MediaType, string> = {
  movie: 'Movie',
  tv: 'TV',
  book: 'Book',
  game: 'Game',
}

export const SCOPE_LABELS: Record<SearchScope, string> = {
  all: 'All',
  movie: 'Movies',
  tv: 'TV',
  book: 'Books',
  game: 'Games',
}

/** "In progress" reads differently per type; every other status is shared. */
const IN_PROGRESS_LABELS: Record<MediaType, string> = {
  movie: 'Watching',
  tv: 'Watching',
  book: 'Reading',
  game: 'Playing',
}

const STATUS_LABELS: Record<EntryStatus, string> = {
  backlog: 'Backlog',
  in_progress: 'In progress',
  completed: 'Completed',
  on_hold: 'On hold',
  dropped: 'Dropped',
}

export function statusLabel(status: EntryStatus, type?: MediaType): string {
  if (status === 'in_progress' && type) return IN_PROGRESS_LABELS[type]
  return STATUS_LABELS[status]
}

export const SOURCE_LABELS: Record<string, string> = {
  tmdb: 'TMDB',
  igdb: 'IGDB',
  google_books: 'Google Books',
  custom: 'Custom',
}
