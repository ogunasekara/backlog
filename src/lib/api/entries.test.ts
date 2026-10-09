import { generateKeyBetween } from 'fractional-indexing'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { nextBacklogPosition } from './entries'

type QueryResult = Promise<{ data: { backlog_position: string }[] | null; error: Error | null }>

const { selectMock, pending } = vi.hoisted(() => ({
  selectMock: vi.fn(),
  // Holds the result the mocked query chain resolves with for the current test.
  pending: { result: null as unknown },
}))

// Mirrors the chain used in nextBacklogPosition: from().select().eq().order().limit()
vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: () => ({
      select: (columns: string) => {
        const builder = {
          eq: (...args: unknown[]) => {
            selectMock('eq', ...args)
            return builder
          },
          order: (...args: unknown[]) => {
            selectMock('order', ...args)
            return builder
          },
          limit: (...args: unknown[]) => {
            selectMock('limit', ...args)
            return pending.result as QueryResult
          },
        }
        selectMock('select', columns)
        return builder
      },
    }),
  },
}))

function respondWith(position: string | null) {
  pending.result = Promise.resolve({
    data: position === null ? [] : [{ backlog_position: position }],
    error: null,
  })
}

beforeEach(() => {
  selectMock.mockClear()
  respondWith(null)
})

function callsOf(method: string) {
  return selectMock.mock.calls.filter(([name]) => name === method).map(([, ...args]) => args)
}

describe('nextBacklogPosition', () => {
  it('returns the first key for the first backlog item', async () => {
    await expect(nextBacklogPosition('bottom')).resolves.toBe(generateKeyBetween(null, null))
    await expect(nextBacklogPosition('top')).resolves.toBe(generateKeyBetween(null, null))
  })

  it('reads only the entry at the relevant end of the backlog', async () => {
    await nextBacklogPosition('bottom')
    expect(callsOf('eq')).toEqual([['status', 'backlog']])
    // Descending for the bottom, so the single row read is the last position.
    expect(callsOf('order')).toEqual([['backlog_position', { ascending: false }]])
    expect(callsOf('limit')).toEqual([[1]])
  })

  it('reads ascending when adding to the top', async () => {
    await nextBacklogPosition('top')
    expect(callsOf('order')).toEqual([['backlog_position', { ascending: true }]])
  })

  it('sorts after the last item when adding to the bottom', async () => {
    respondWith('a0')
    const position = await nextBacklogPosition('bottom')
    expect(position > 'a0').toBe(true)
  })

  it('sorts before the first item when adding to the top', async () => {
    respondWith('a0')
    const position = await nextBacklogPosition('top')
    expect(position < 'a0').toBe(true)
  })

  it('keeps producing keys that sort correctly over repeated inserts at each end', async () => {
    let top = 'a0'
    let bottom = 'a0'
    const keys = [top]

    for (let i = 0; i < 20; i++) {
      respondWith(top)
      top = await nextBacklogPosition('top')
      keys.unshift(top)

      respondWith(bottom)
      bottom = await nextBacklogPosition('bottom')
      keys.push(bottom)
    }

    // The insertion order must match plain string ordering, which is what
    // Postgres gives back for a `collate "C"` column.
    expect(keys).toEqual([...keys].sort())
    expect(new Set(keys).size).toBe(keys.length)
  })

  it('propagates a query error rather than returning a bad position', async () => {
    pending.result = Promise.resolve({ data: null, error: new Error('permission denied') })
    await expect(nextBacklogPosition('bottom')).rejects.toThrow('permission denied')
  })
})
