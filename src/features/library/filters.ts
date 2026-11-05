import {
  ENTRY_STATUSES,
  MEDIA_TYPES,
  type EntryStatus,
  type EntryWithMedia,
  type MediaType,
} from '@/lib/types'

export type LibrarySort = 'added' | 'title' | 'rating'
export const LIBRARY_SORTS: LibrarySort[] = ['added', 'title', 'rating']

export const SORT_LABELS: Record<LibrarySort, string> = {
  added: 'Date added',
  title: 'Title',
  rating: 'Rating',
}

export type LibraryView = {
  type: MediaType | null
  status: EntryStatus | null
  sort: LibrarySort
}

/** Reads the view from the URL, ignoring values that aren't valid. */
export function parseLibraryView(params: URLSearchParams): LibraryView {
  const type = params.get('type')
  const status = params.get('status')
  const sort = params.get('sort')
  return {
    type: (MEDIA_TYPES as string[]).includes(type ?? '') ? (type as MediaType) : null,
    status: (ENTRY_STATUSES as string[]).includes(status ?? '') ? (status as EntryStatus) : null,
    sort: (LIBRARY_SORTS as string[]).includes(sort ?? '') ? (sort as LibrarySort) : 'added',
  }
}

const byTitle = (a: EntryWithMedia, b: EntryWithMedia) =>
  a.media.title.localeCompare(b.media.title, undefined, { sensitivity: 'base', numeric: true })

const byAddedDesc = (a: EntryWithMedia, b: EntryWithMedia) =>
  b.created_at.localeCompare(a.created_at)

const COMPARATORS: Record<LibrarySort, (a: EntryWithMedia, b: EntryWithMedia) => number> = {
  added: byAddedDesc,
  title: (a, b) => byTitle(a, b) || byAddedDesc(a, b),
  // Highest first; unrated entries go last, then alphabetical among equals.
  rating: (a, b) => (b.rating ?? 0) - (a.rating ?? 0) || byTitle(a, b),
}

export function applyLibraryView(entries: EntryWithMedia[], view: LibraryView): EntryWithMedia[] {
  return entries
    .filter(
      (entry) =>
        (view.type === null || entry.media.type === view.type) &&
        (view.status === null || entry.status === view.status),
    )
    .sort(COMPARATORS[view.sort])
}
