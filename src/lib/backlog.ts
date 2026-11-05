import { generateKeyBetween, generateNKeysBetween } from 'fractional-indexing'
import type { Entry } from '@/lib/types'

type Positioned = Pick<Entry, 'id' | 'backlog_position' | 'created_at'>

/**
 * Backlog order. Keys compare by code unit, which is what Postgres gives for the
 * `collate "C"` column; date added breaks ties between equal keys.
 */
export function compareBacklog(a: Positioned, b: Positioned): number {
  const pa = a.backlog_position ?? ''
  const pb = b.backlog_position ?? ''
  if (pa !== pb) return pa < pb ? -1 : 1
  return a.created_at.localeCompare(b.created_at) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
}

/**
 * The key that puts entry `id` at `index` of the whole ordered backlog, leaving every
 * other entry where it is, so the move writes one row.
 */
export function positionAt(ordered: Positioned[], id: string, index: number): string {
  const rest = ordered.filter((entry) => entry.id !== id)
  const before = rest[index - 1]?.backlog_position ?? null

  // Two simultaneous adds can produce the same key, and no key fits between equal
  // neighbours. Skip ahead to the first larger key, so the entry lands just after them.
  let next = index
  while (
    before !== null &&
    rest[next]?.backlog_position != null &&
    rest[next]!.backlog_position! <= before
  ) {
    next++
  }
  const after = rest[next]?.backlog_position ?? null

  return generateKeyBetween(before, after)
}

export type PositionUpdate = { id: string; position: string }

/**
 * Moves `id` to `toIndex` within the entries a view shows (`visibleIds`, one type's
 * backlog or all of it), and returns the new positions to write.
 *
 * The visible entries keep the global slots they already hold and only reshuffle
 * among them, so other types never move: with shows in slots 2 and 6, putting the
 * second one first swaps them, leaving slots 1 and 3-5 alone. In the All view every
 * entry is visible, so this is a plain move.
 *
 * Only as many rows as needed are rewritten: entries whose keys are already in order
 * (the longest increasing run) keep them, and the rest get fresh keys between those.
 * A move in the All view writes one row; a swap in a type tab writes two.
 */
export function reorderWithin(
  backlog: Positioned[],
  visibleIds: string[],
  id: string,
  toIndex: number,
): PositionUpdate[] {
  const ordered = [...backlog].sort(compareBacklog)
  const reordered = visibleIds.filter((visibleId) => visibleId !== id)
  reordered.splice(toIndex, 0, id)

  // Hand the visible slots, in order, to the reordered visible entries.
  const visible = new Set(visibleIds)
  let next = 0
  const order = ordered.map((entry) => (visible.has(entry.id) ? reordered[next++]! : entry.id))

  const positionOf = new Map(ordered.map((entry) => [entry.id, entry.backlog_position]))
  const keys = order.map((entryId) => positionOf.get(entryId) ?? null)
  // Which rows keep their keys, in priority order: other types always do (their slots
  // never change, and their keys are already in order); then as many visible rows as
  // possible; and when it costs nothing extra, the dragged row is the one rewritten.
  const n = order.length
  const weights = order.map((entryId) =>
    !visible.has(entryId) ? n * n + 1 : entryId === id ? n - 1 : n,
  )
  const keep = heaviestIncreasing(keys, weights)

  const updates: PositionUpdate[] = []
  let lower: string | null = null
  let pending: string[] = []
  const flush = (upper: string | null) => {
    if (pending.length === 0) return
    const fresh = generateNKeysBetween(lower, upper, pending.length)
    pending.forEach((entryId, i) => updates.push({ id: entryId, position: fresh[i]! }))
    pending = []
  }

  order.forEach((entryId, i) => {
    if (keep.has(i)) {
      flush(keys[i]!)
      lower = keys[i]!
    } else {
      pending.push(entryId)
    }
  })
  flush(null)

  return updates
}

/**
 * Indexes of the strictly increasing run of keys with the largest total weight; nulls
 * never count. Quadratic, which is fine at the size of one person's backlog.
 */
function heaviestIncreasing(keys: (string | null)[], weights: number[]): Set<number> {
  const best = keys.map(() => 0)
  const previous = keys.map(() => -1)
  let end = -1

  keys.forEach((key, i) => {
    if (key === null) return
    best[i] = weights[i]!
    for (let j = 0; j < i; j++) {
      const before = keys[j]
      if (before !== null && before! < key && best[j]! + weights[i]! > best[i]!) {
        best[i] = best[j]! + weights[i]!
        previous[i] = j
      }
    }
    if (end === -1 || best[i]! > best[end]!) end = i
  })

  const keep = new Set<number>()
  for (let i = end; i !== -1; i = previous[i]!) keep.add(i)
  return keep
}
