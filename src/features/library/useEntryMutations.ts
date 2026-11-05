import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { nextBacklogPosition, removeEntry, updateEntry } from '@/lib/api/entries'
import { entriesKey } from '@/lib/api/keys'
import { fetchMediaDetails } from '@/lib/api/search'
import { localToday, statusTransition, type EntryPatch } from '@/lib/status'
import type { EntryStatus, EntryWithMedia } from '@/lib/types'

const updateKey = ['entries', 'update'] as const

type UpdateInput = { id: string; patch: EntryPatch; needsBacklogPosition?: boolean }

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
    onMutate: async ({ id, patch }) => {
      await queryClient.cancelQueries({ queryKey: entriesKey })
      const previous = queryClient.getQueryData<EntryWithMedia[]>(entriesKey)
      queryClient.setQueryData<EntryWithMedia[]>(entriesKey, (entries) =>
        entries?.map((entry) => (entry.id === id ? { ...entry, ...patch } : entry)),
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

/** Re-fetches a catalog item's metadata through the `details` function. */
export function useRefreshMetadata() {
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
      toast.success('Metadata refreshed')
    },
    onError: (error) => toast.error(errorMessage(error, 'Could not refresh the metadata')),
  })
}
