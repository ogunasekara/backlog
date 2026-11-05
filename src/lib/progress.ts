import type { Entry, Media } from '@/lib/types'

export type BookProgress = Pick<Entry, 'progress_pages' | 'progress_percent'>

/** The metadata page count, if the source supplied a usable one. */
export function pageCountOf(media: Pick<Media, 'details'>): number | null {
  const count = media.details.page_count
  return typeof count === 'number' && Number.isInteger(count) && count > 0 ? count : null
}

function clampPercent(percent: number): number {
  return Math.min(100, Math.max(0, Math.round(percent)))
}

/** Entering pages derives the percent when the page count is known. */
export function progressFromPages(pages: number | null, pageCount: number | null): BookProgress {
  if (pages === null) return { progress_pages: null, progress_percent: null }
  const whole = Math.max(0, Math.round(pages))
  if (pageCount === null) return { progress_pages: whole, progress_percent: null }
  const capped = Math.min(whole, pageCount)
  return { progress_pages: capped, progress_percent: clampPercent((capped / pageCount) * 100) }
}

/** Entering a percent derives the page when the page count is known. */
export function progressFromPercent(
  percent: number | null,
  pageCount: number | null,
): BookProgress {
  if (percent === null) return { progress_pages: null, progress_percent: null }
  const clamped = clampPercent(percent)
  if (pageCount === null) return { progress_pages: null, progress_percent: clamped }
  return { progress_pages: Math.round((clamped / 100) * pageCount), progress_percent: clamped }
}
