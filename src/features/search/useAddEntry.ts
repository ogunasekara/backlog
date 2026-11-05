import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { addEntry, DuplicateEntryError, type BacklogPlacement } from '@/lib/api/entries'
import { fetchMediaDetails } from '@/lib/api/search'
import { entriesKey } from '@/lib/api/keys'
import type { EntryStatus, SearchResult } from '@/lib/types'

export type AddFromSearchInput = {
  result: SearchResult
  status: EntryStatus
  placement: BacklogPlacement
}

/**
 * Adds a search hit: upserts the catalog metadata through the `details` function,
 * then creates the entry. Re-adding something you already have is not an error —
 * it reports the duplicate so the caller can open the existing entry.
 */
export function useAddFromSearch(
  options: { onAdded?: () => void; onDuplicate?: (entryId: string | null) => void } = {},
) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ result, status, placement }: AddFromSearchInput) => {
      const media = await fetchMediaDetails(result.source, result.externalId, result.type)
      await addEntry({ mediaId: media.id, status, placement })
      return media
    },
    onSuccess: (media) => {
      void queryClient.invalidateQueries({ queryKey: entriesKey })
      toast.success(`Added ${media.title}`)
      options.onAdded?.()
    },
    onError: (error) => {
      if (error instanceof DuplicateEntryError) {
        toast.info('Already in your library')
        options.onDuplicate?.(error.entryId)
        return
      }
      toast.error(error instanceof Error ? error.message : 'Could not add that item')
    },
  })
}
