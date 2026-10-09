import { describe, expect, it } from 'vitest'
import { interleave, runSearchTasks, type SearchTask } from './search.ts'
import type { SearchResult } from './types.ts'

function hit(title: string): SearchResult {
  return { type: 'movie', source: 'tmdb', externalId: title, title }
}

const task = (over: Partial<SearchTask> & Pick<SearchTask, 'run'>): SearchTask => ({
  type: 'movie',
  source: 'tmdb',
  ...over,
})

describe('interleave', () => {
  it('takes one result from each group in turn', () => {
    const merged = interleave([
      [hit('m1'), hit('m2'), hit('m3')],
      [hit('b1')],
      [hit('g1'), hit('g2')],
    ])
    expect(merged.map((r) => r.title)).toEqual(['m1', 'b1', 'g1', 'm2', 'g2', 'm3'])
  })

  it('handles no groups and empty groups', () => {
    expect(interleave([])).toEqual([])
    expect(interleave([[], []])).toEqual([])
  })
})

describe('runSearchTasks', () => {
  it('returns merged results with no errors key when every source succeeds', async () => {
    const response = await runSearchTasks([
      task({ run: async () => [hit('a')] }),
      task({ type: 'book', source: 'google_books', run: async () => [hit('b')] }),
    ])
    expect(response.results.map((r) => r.title)).toEqual(['a', 'b'])
    expect(response.errors).toBeUndefined()
  })

  it('keeps results from healthy sources when one fails', async () => {
    const response = await runSearchTasks([
      task({ run: async () => [hit('a')] }),
      task({
        type: 'game',
        source: 'igdb',
        run: () => Promise.reject(new Error('IGDB is down')),
      }),
    ])
    expect(response.results.map((r) => r.title)).toEqual(['a'])
    expect(response.errors).toEqual([{ source: 'igdb', type: 'game', message: 'IGDB is down' }])
  })

  it('reports every failure when all sources fail', async () => {
    const response = await runSearchTasks([
      task({ run: () => Promise.reject(new Error('one')) }),
      task({ type: 'tv', run: () => Promise.reject('two') }),
    ])
    expect(response.results).toEqual([])
    expect(response.errors).toEqual([
      { source: 'tmdb', type: 'movie', message: 'one' },
      { source: 'tmdb', type: 'tv', message: 'two' },
    ])
  })

  it('isolates a task that throws synchronously instead of failing the whole fan-out', async () => {
    const response = await runSearchTasks([
      task({
        run: () => {
          throw new Error('TMDB is not configured')
        },
      }),
      task({ type: 'book', source: 'google_books', run: async () => [hit('b')] }),
    ])
    expect(response.results.map((r) => r.title)).toEqual(['b'])
    expect(response.errors).toEqual([
      { source: 'tmdb', type: 'movie', message: 'TMDB is not configured' },
    ])
  })

  it('runs the tasks in parallel rather than one after another', async () => {
    const started: number[] = []
    const slow = (id: number): SearchTask =>
      task({
        run: async () => {
          started.push(id)
          await new Promise((resolve) => setTimeout(resolve, 20))
          return [hit(`t${id}`)]
        },
      })
    const begin = Date.now()
    await runSearchTasks([slow(1), slow(2), slow(3)])
    // Sequential execution would take at least 60ms and start each task late.
    expect(started).toEqual([1, 2, 3])
    expect(Date.now() - begin).toBeLessThan(55)
  })
})
