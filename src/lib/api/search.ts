import { supabase } from '@/lib/supabase'
import type { CatalogSource, Media, MediaType, SearchResponse, SearchScope } from '@/lib/types'

/** Unwraps a FunctionsHttpError, whose body holds the message the function sent. */
async function invoke<T>(name: string, body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke<T>(name, { body })
  if (!error) return data as T

  let message = error.message
  const response = (error as { context?: Response }).context
  if (response instanceof Response) {
    const text = await response.text().catch(() => '')
    try {
      message = (JSON.parse(text) as { error?: string }).error ?? message
    } catch {
      if (text) message = text
    }
  }
  throw new Error(message)
}

export function searchMedia(scope: SearchScope, query: string): Promise<SearchResponse> {
  return invoke<SearchResponse>('search', { type: scope, query })
}

/**
 * Fetches the full record for a catalog item and upserts it into `media`.
 * TMDB needs the type, because movies and shows use different endpoints.
 */
export async function fetchMediaDetails(
  source: CatalogSource,
  externalId: string,
  type: MediaType,
): Promise<Media> {
  const { media } = await invoke<{ media: Media }>('details', { source, externalId, type })
  return media
}
