import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  nextBacklogPosition,
  removeEntry,
  setBacklogPositions,
  updateEntry,
} from '@/lib/api/entries'
import { entriesKey } from '@/lib/api/keys'
import { fetchMediaDetails } from '@/lib/api/search'
import { compareBacklog, positionAt, reorderWithin, type PositionUpdate } from '@/lib/backlog'
import { localToday, statusTransition, type EntryPatch } from '@/lib/status'
import type { EntryStatus, EntryWithMedia } from '@/lib/types'

const updateKey = ['entries', 'update'] as const

type UpdateInput = { id: string; patch: EntryPatch; needsBacklogPosition?: boolean }

function bottomOf(entries: EntryWithMedia[], id: string): string {
  const backlog = entries.filter((entry) => entry.status === 'backlog').sort(compareBacklog)
  return positionAt(backlog, id, backlog.length)
}

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback
}

/**
 * Writes a patch to one entry, showing it in the cached library straight away and
 * rolling back if the write fails.
 */
export function useUpdateEntry() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationKey: updateKey,
    mutationFn: async ({ id, patch, needsBacklogPosition }: UpdateInput) =>
      updateEntry(
        id,
        needsBacklogPosition
          ? { ...patch, backlog_position: await nextBacklogPosition('bottom') }
          : patch,
      ),
    onMutate: async ({ id, patch, needsBacklogPosition }) => {
      await queryClient.cancelQueries({ queryKey: entriesKey })
      const previous = queryClient.getQueryData<EntryWithMedia[]>(entriesKey)
      // Until the server read returns the real bottom key, place it last from the cache.
      const optimistic =
        needsBacklogPosition && previous
          ? { ...patch, backlog_position: bottomOf(previous, id) }
          : patch
      queryClient.setQueryData<EntryWithMedia[]>(entriesKey, (entries) =>
        entries?.map((entry) => (entry.id === id ? { ...entry, ...optimistic } : entry)),
      )
      return { previous }
    },
    onError: (error, _input, context) => {
      if (context?.previous) queryClient.setQueryData(entriesKey, context.previous)
      toast.error(errorMessage(error, 'Could not save that change'))
    },
    onSettled: () => {
      // Refetching while another edit is in flight would briefly undo its optimistic
      // value, so only the last edit to settle refetches.
      if (queryClient.isMutating({ mutationKey: updateKey }) === 1) {
        return queryClient.invalidateQueries({ queryKey: entriesKey })
      }
    },
  })
}

/** Status changes carry the date and backlog side effects from `statusTransition`. */
export function useChangeStatus() {
  const update = useUpdateEntry()

  function changeStatus(entry: EntryWithMedia, next: EntryStatus) {
    const { patch, needsBacklogPosition } = statusTransition(entry, next, localToday())
    if (Object.keys(patch).length === 0) return
    update.mutate({ id: entry.id, patch, needsBacklogPosition })
  }

  return { changeStatus, isPending: update.isPending }
}

/**
 * Reorders the backlog. Positions are computed from the cached order, so the move
 * shows at once. One changed row is a plain update; several go in one call so a
 * reorder can't half-apply.
 */
export function useMoveInBacklog() {
  const queryClient = useQueryClient()

  const move = useMutation({
    mutationKey: updateKey,
    mutationFn: async (updates: PositionUpdate[]) => {
      if (updates.length === 1) {
        await updateEntry(updates[0]!.id, { backlog_position: updates[0]!.position })
      } else {
        await setBacklogPositions(updates)
      }
    },
    onMutate: async (updates) => {
      await queryClient.cancelQueries({ queryKey: entriesKey })
      const previous = queryClient.getQueryData<EntryWithMedia[]>(entriesKey)
      const fresh = new Map(updates.map(({ id, position }) => [id, position]))
      queryClient.setQueryData<EntryWithMedia[]>(entriesKey, (entries) =>
        entries?.map((entry) =>
          fresh.has(entry.id) ? { ...entry, backlog_position: fresh.get(entry.id)! } : entry,
        ),
      )
      return { previous }
    },
    onError: (error, _updates, context) => {
      if (context?.previous) queryClient.setQueryData(entriesKey, context.previous)
      toast.error(errorMessage(error, 'Could not save the new order'))
    },
    onSettled: () => {
      if (queryClient.isMutating({ mutationKey: updateKey }) === 1) {
        return queryClient.invalidateQueries({ queryKey: entriesKey })
      }
    },
  })

  /**
   * Moves `id` to `index` among `visibleIds` (one type's backlog, or all of it); see
   * `reorderWithin`. Returns the updates, so a caller can show them before the cache
   * catches up.
   */
  function moveTo(
    backlog: EntryWithMedia[],
    visibleIds: string[],
    id: string,
    index: number,
    options: { onError?: () => void } = {},
  ): PositionUpdate[] {
    const updates = reorderWithin(backlog, visibleIds, id, index)
    if (updates.length > 0) move.mutate(updates, { onError: options.onError })
    return updates
  }

  const allIds = (backlog: EntryWithMedia[]) => backlog.map((entry) => entry.id)

  return {
    moveTo,
    moveToTop: (backlog: EntryWithMedia[], id: string) => moveTo(backlog, allIds(backlog), id, 0),
    moveToBottom: (backlog: EntryWithMedia[], id: string) =>
      moveTo(backlog, allIds(backlog), id, backlog.length - 1),
  }
}

export function useRemoveEntry(options: { onRemoved?: () => void } = {}) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: removeEntry,
    onSuccess: (_data, entry) => {
      queryClient.setQueryData<EntryWithMedia[]>(entriesKey, (entries) =>
        entries?.filter(({ id }) => id !== entry.id),
      )
      toast.success(`Removed ${entry.media.title}`)
      options.onRemoved?.()
    },
    onError: (error) => toast.error(errorMessage(error, 'Could not remove that item')),
    onSettled: () => queryClient.invalidateQueries({ queryKey: entriesKey }),
  })
}

/**
 * Re-fetches a catalog item's metadata through the `details` function. `quiet` is for
 * the automatic refresh on opening a show: no toasts either way, since the user didn't
 * ask and the cached metadata still works if it fails.
 */
export function useRefreshMetadata({ quiet = false }: { quiet?: boolean } = {}) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (entry: EntryWithMedia) => {
      const { source, external_id, type } = entry.media
      if (source === 'custom' || external_id === null) {
        throw new Error('Custom items have no source to refresh from')
      }
      return fetchMediaDetails(source, external_id, type)
    },
    onSuccess: (media) => {
      queryClient.setQueryData<EntryWithMedia[]>(entriesKey, (entries) =>
        entries?.map((entry) => (entry.media.id === media.id ? { ...entry, media } : entry)),
      )
      if (!quiet) toast.success('Metadata refreshed')
    },
    onError: (error) => {
      if (!quiet) toast.error(errorMessage(error, 'Could not refresh the metadata'))
    },
  })
}
