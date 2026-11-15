import { compareBacklog } from '@/lib/backlog'
import {
  ENTRY_STATUSES,
  MEDIA_TYPES,
  type EntryStatus,
  type EntryWithMedia,
  type MediaType,
} from '@/lib/types'

export type LibrarySort = 'position' | 'added' | 'updated' | 'title' | 'rating'

/** Backlog order only means something, and is the default, when showing the backlog. Elsewhere the default is last updated. */
export function sortsFor(status: EntryStatus | null): LibrarySort[] {
  return status === 'backlog'
    ? ['position', 'added', 'updated', 'title', 'rating']
    : ['updated', 'added', 'title', 'rating']
}

export function defaultSort(status: EntryStatus | null): LibrarySort {
  return sortsFor(status)[0]!
}

export const SORT_LABELS: Record<LibrarySort, string> = {
  position: 'Backlog order',
  added: 'Date added',
  updated: 'Last updated',
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
  const typeParam = params.get('type')
  const statusParam = params.get('status')
  const sortParam = params.get('sort')
  const status = (ENTRY_STATUSES as string[]).includes(statusParam ?? '')
    ? (statusParam as EntryStatus)
    : null
  return {
    type: (MEDIA_TYPES as string[]).includes(typeParam ?? '') ? (typeParam as MediaType) : null,
    status,
    sort: (sortsFor(status) as string[]).includes(sortParam ?? '')
      ? (sortParam as LibrarySort)
      : defaultSort(status),
  }
}

const byTitle = (a: EntryWithMedia, b: EntryWithMedia) =>
  a.media.title.localeCompare(b.media.title, undefined, { sensitivity: 'base', numeric: true })

const byAddedDesc = (a: EntryWithMedia, b: EntryWithMedia) =>
  b.created_at.localeCompare(a.created_at)

const COMPARATORS: Record<LibrarySort, (a: EntryWithMedia, b: EntryWithMedia) => number> = {
  position: compareBacklog,
  added: byAddedDesc,
  updated: (a, b) => b.updated_at.localeCompare(a.updated_at) || byAddedDesc(a, b),
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
