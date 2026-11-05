import type { Entry, EntryStatus } from '@/lib/types'

export type EntryPatch = Partial<
  Pick<
    Entry,
    | 'status'
    | 'rating'
    | 'notes'
    | 'started_on'
    | 'finished_on'
    | 'progress_percent'
    | 'progress_pages'
    | 'backlog_position'
  >
>

export type StatusTransition = {
  patch: EntryPatch
  /** Moving into the backlog needs a fresh position at the bottom, which takes a read. */
  needsBacklogPosition: boolean
}

/** Today as a plain `YYYY-MM-DD` in local time, matching the `date` columns. */
export function localToday(now = new Date()): string {
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${now.getFullYear()}-${month}-${day}`
}

/**
 * The side effects of a status change (implementation plan, section 6). Auto-filled
 * dates only ever touch empty fields; completing never invents a start date.
 */
export function statusTransition(
  entry: Pick<Entry, 'status' | 'started_on' | 'finished_on'>,
  next: EntryStatus,
  today: string,
): StatusTransition {
  if (next === entry.status) return { patch: {}, needsBacklogPosition: false }

  const patch: EntryPatch = { status: next }
  if (entry.status === 'backlog') patch.backlog_position = null

  if (next === 'in_progress' && !entry.started_on) patch.started_on = today
  if (next === 'completed' && !entry.finished_on) patch.finished_on = today

  return { patch, needsBacklogPosition: next === 'backlog' }
}
