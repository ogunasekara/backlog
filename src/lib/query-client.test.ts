import { dehydrate, hydrate } from '@tanstack/react-query'
import { describe, expect, it, vi } from 'vitest'
import { entriesKey, searchKey } from '@/lib/api/keys'
import { createQueryClient, persistOptions } from './query-client'

describe('the saved cache', () => {
  it('keeps the library and nothing else', () => {
    const client = createQueryClient()
    client.setQueryData(entriesKey, [])
    client.setQueryData(searchKey('all', 'dune'), { results: [] })

    const saved = dehydrate(client, persistOptions.dehydrateOptions)

    expect(saved.queries.map((query) => query.queryKey)).toEqual([entriesKey])
    expect(saved.mutations).toEqual([])
  })

  it('keeps a restored library in memory until a screen asks for it', async () => {
    const saved = createQueryClient()
    saved.setQueryData(entriesKey, ['an entry'])
    const state = dehydrate(saved, persistOptions.dehydrateOptions)

    vi.useFakeTimers()
    try {
      const client = createQueryClient()
      hydrate(client, state)
      // Nothing observes it yet; it must survive the garbage-collection timer.
      await vi.advanceTimersByTimeAsync(60_000)
      expect(client.getQueryData(entriesKey)).toEqual(['an entry'])
    } finally {
      vi.useRealTimers()
    }
  })
})
