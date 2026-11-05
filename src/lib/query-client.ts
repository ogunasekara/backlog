import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister'
import { QueryClient, type Query } from '@tanstack/react-query'
import type { PersistQueryClientOptions } from '@tanstack/react-query-persist-client'
import { del, get, set } from 'idb-keyval'
import { entriesKey } from '@/lib/api/keys'

/** How long a saved library stays usable offline. */
const CACHE_MAX_AGE = 1000 * 60 * 60 * 24 * 30

/** IndexedDB key (idb-keyval's default database) holding the saved cache. */
export const CACHE_STORAGE_KEY = 'backlog-query-cache'

/**
 * Bump when the shape of a cached query changes, so an old save is thrown away rather
 * than read as the new shape.
 */
const CACHE_SCHEMA = '1'

export function createQueryClient() {
  const client = new QueryClient({
    defaultOptions: {
      // Writes need a connection (v1 has no offline writes). The UI disables them while
      // offline; one that slips through fails at once and rolls back, instead of pausing
      // with its optimistic value on screen until the connection returns.
      mutations: { networkMode: 'always' },
    },
  })
  // The library is never garbage-collected: a query dropped from memory is dropped from
  // the save. A gcTime as long as the max age doesn't work, because it's past the
  // longest setTimeout (about 24.8 days); the timer overflows and fires at once, which
  // removed the library the moment it was restored, before any screen subscribed to it.
  client.setQueryDefaults(entriesKey, { gcTime: Infinity })
  return client
}

const persister = createAsyncStoragePersister({
  storage: { getItem: get, setItem: set, removeItem: del },
  key: CACHE_STORAGE_KEY,
  throttleTime: 1000,
})

/** Only the library is saved: search results go stale fast and aren't useful offline. */
function isLibrary(query: Query) {
  return query.queryKey[0] === entriesKey[0] && query.state.status === 'success'
}

export const persistOptions: Omit<PersistQueryClientOptions, 'queryClient'> = {
  persister,
  maxAge: CACHE_MAX_AGE,
  buster: CACHE_SCHEMA,
  dehydrateOptions: {
    shouldDehydrateQuery: isLibrary,
    shouldDehydrateMutation: () => false,
  },
}

/** Drops the library from memory and from IndexedDB, e.g. on sign-out. */
export async function clearCachedLibrary(queryClient: QueryClient) {
  queryClient.clear()
  await persister.removeClient()
}
