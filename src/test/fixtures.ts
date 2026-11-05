import type { Entry, EntryWithMedia, Media } from '@/lib/types'

let counter = 0

/** An entry with its media, defaulting to a fresh backlog movie. */
export function makeEntry(
  overrides: Partial<Entry> = {},
  media: Partial<Media> = {},
): EntryWithMedia {
  counter += 1
  const id = overrides.id ?? `entry-${counter}`
  const mediaRow: Media = {
    id: `media-${id}`,
    type: 'movie',
    source: 'tmdb',
    external_id: String(1000 + counter),
    title: `Title ${counter}`,
    year: 2010,
    description: null,
    cover_url: null,
    details: {},
    created_by: null,
    fetched_at: '2026-10-01T00:00:00Z',
    ...media,
  }
  return {
    id,
    user_id: 'user-1',
    media_id: mediaRow.id,
    status: 'backlog',
    rating: null,
    notes: '',
    started_on: null,
    finished_on: null,
    progress_percent: null,
    progress_pages: null,
    tv_season: 1,
    tv_episode: 0,
    backlog_position: overrides.status && overrides.status !== 'backlog' ? null : 'a0',
    created_at: `2026-10-${String((counter % 28) + 1).padStart(2, '0')}T00:00:00Z`,
    updated_at: '2026-10-01T00:00:00Z',
    ...overrides,
    media: mediaRow,
  }
}
