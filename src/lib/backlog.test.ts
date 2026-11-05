import { generateKeyBetween } from 'fractional-indexing'
import { describe, expect, it } from 'vitest'
import { compareBacklog, positionAt, reorderWithin, type PositionUpdate } from './backlog'

type Row = { id: string; backlog_position: string | null; created_at: string }

function rows(...positions: string[]): Row[] {
  return positions.map((backlog_position, i) => ({
    id: `e${i}`,
    backlog_position,
    created_at: `2026-10-0${i + 1}T00:00:00Z`,
  }))
}

/** Applies a move the way the server would: rewrite one row, then sort. */
function move(list: Row[], id: string, index: number): Row[] {
  const position = positionAt(list, id, index)
  return list
    .map((row) => (row.id === id ? { ...row, backlog_position: position } : row))
    .sort(compareBacklog)
}

const ids = (list: Row[]) => list.map((row) => row.id)

describe('positionAt', () => {
  const list = rows('a0', 'a1', 'a2', 'a3')

  it('moves an entry to the top', () => {
    expect(ids(move(list, 'e2', 0))).toEqual(['e2', 'e0', 'e1', 'e3'])
    expect(positionAt(list, 'e2', 0) < 'a0').toBe(true)
  })

  it('moves an entry to the bottom', () => {
    expect(ids(move(list, 'e0', 3))).toEqual(['e1', 'e2', 'e3', 'e0'])
    expect(positionAt(list, 'e0', 3) > 'a3').toBe(true)
  })

  it('moves an entry down and up between neighbours', () => {
    expect(ids(move(list, 'e0', 2))).toEqual(['e1', 'e2', 'e0', 'e3'])
    expect(ids(move(list, 'e3', 1))).toEqual(['e0', 'e3', 'e1', 'e2'])
  })

  it('gives the first key to the only entry', () => {
    expect(positionAt(rows('a5'), 'e0', 0)).toBe(generateKeyBetween(null, null))
  })

  it('keeps keys ordered and distinct over many inserts into the same gap', () => {
    let list = rows('a0', 'a1')
    for (let i = 0; i < 50; i++) {
      // Always drop a new entry straight after the first one.
      list = [...list, { id: `n${i}`, backlog_position: 'z', created_at: '2026-11-01T00:00:00Z' }]
      list = move(list.sort(compareBacklog), `n${i}`, 1)
      expect(list[1]!.id).toBe(`n${i}`)
    }
    const keys = list.map((row) => row.backlog_position!)
    expect(keys).toEqual([...keys].sort())
    expect(new Set(keys).size).toBe(keys.length)
    expect(list.at(-1)!.id).toBe('e1')
  })

  it('still finds room next to duplicate keys', () => {
    const list = rows('a0', 'a1', 'a1', 'a2')
    const position = positionAt(list, 'e0', 1)
    expect(position > 'a1' && position < 'a2').toBe(true)
  })
})

describe('compareBacklog', () => {
  it('sorts by code unit like collate "C", not by locale', () => {
    const list = rows('a0', 'Zz', 'a0V').sort(compareBacklog)
    expect(list.map((row) => row.backlog_position)).toEqual(['Zz', 'a0', 'a0V'])
  })

  it('breaks ties by date added', () => {
    const [first, second] = rows('a1', 'a1')
    expect([second!, first!].sort(compareBacklog)).toEqual([first, second])
  })
})

describe('reorderWithin', () => {
  type Typed = Row & { type: string }

  /** A backlog from a pattern like 'm t m m m t m': one entry per letter, in order. */
  function backlogOf(pattern: string): Typed[] {
    let key: string | null = null
    return pattern.split(' ').map((type, i) => {
      key = generateKeyBetween(key, null)
      return { id: `${type}${i + 1}`, type, backlog_position: key, created_at: '' }
    })
  }

  function apply(list: Typed[], updates: PositionUpdate[]): Typed[] {
    const fresh = new Map(updates.map((update) => [update.id, update.position]))
    return list
      .map((row) => ({ ...row, backlog_position: fresh.get(row.id) ?? row.backlog_position }))
      .sort(compareBacklog)
  }

  function visibleOf(list: Typed[], type?: string) {
    return list.filter((row) => !type || row.type === type).map((row) => row.id)
  }

  it('swaps two shows within their own slots, leaving everything else alone', () => {
    // Shows at positions 2 and 6. Moving the second to the top of the TV tab swaps them.
    const list = backlogOf('m t m m m t m')
    const updates = reorderWithin(list, visibleOf(list, 't'), 't6', 0)

    expect(ids(apply(list, updates))).toEqual(['m1', 't6', 'm3', 'm4', 'm5', 't2', 'm7'])
    expect(updates.map((update) => update.id).sort()).toEqual(['t2', 't6'])
  })

  it('keeps the type in its slots when moving to the bottom of a tab', () => {
    const list = backlogOf('t m t m t')
    const updates = reorderWithin(list, visibleOf(list, 't'), 't1', 2)
    expect(ids(apply(list, updates))).toEqual(['t3', 'm2', 't5', 'm4', 't1'])
  })

  it('rotates several entries through their slots', () => {
    const list = backlogOf('g m g m g m g')
    const updates = reorderWithin(list, visibleOf(list, 'g'), 'g7', 0)
    expect(ids(apply(list, updates))).toEqual(['g7', 'm2', 'g1', 'm4', 'g3', 'm6', 'g5'])
  })

  it('writes one row for a move in the All view', () => {
    const list = backlogOf('m t m g t')
    for (const [id, to] of [
      ['g4', 0],
      ['m1', 4],
      ['t2', 3],
    ] as const) {
      const updates = reorderWithin(list, visibleOf(list), id, to)
      expect(updates).toEqual([{ id, position: expect.any(String) }])
      expect(ids(apply(list, updates)).indexOf(id)).toBe(to)
    }
  })

  it('writes nothing when the order does not change', () => {
    const list = backlogOf('m t m')
    expect(reorderWithin(list, visibleOf(list, 't'), 't2', 0)).toEqual([])
  })

  it('never rewrites other types, even when the tab is fully reversed', () => {
    const list = backlogOf('g m g')
    const updates = reorderWithin(list, visibleOf(list, 'g'), 'g3', 0)
    expect(ids(apply(list, updates))).toEqual(['g3', 'm2', 'g1'])
    expect(updates.map((update) => update.id).sort()).toEqual(['g1', 'g3'])
  })

  it('holds for random backlogs and moves', () => {
    // A small seeded generator, so a failure reproduces.
    let seed = 42
    const random = (below: number) => {
      seed = (seed * 1103515245 + 12345) % 2 ** 31
      return seed % below
    }

    for (let round = 0; round < 300; round++) {
      const types = ['m', 't', 'g']
      const length = 1 + random(12)
      const list = backlogOf(Array.from({ length }, () => types[random(3)]!).join(' '))
      const type = random(4) === 0 ? undefined : list[random(length)]!.type
      const visible = visibleOf(list, type)
      const id = visible[random(visible.length)]!
      const to = random(visible.length)

      const updates = reorderWithin(list, visible, id, to)
      const result = apply(list, updates)

      // The visible entries are in the new order...
      const expected = visible.filter((visibleId) => visibleId !== id)
      expected.splice(to, 0, id)
      expect(visibleOf(result, type)).toEqual(expected)
      // ...every other entry kept its slot and its key...
      list.forEach((row, slot) => {
        if (!visible.includes(row.id)) expect(result[slot]!.id).toBe(row.id)
      })
      expect(updates.every((update) => visible.includes(update.id))).toBe(true)
      // ...and a move in the All view writes at most one row.
      if (!type) expect(updates.length).toBeLessThanOrEqual(1)
    }
  })

  it('works from any input order and rewrites a duplicate key', () => {
    const list = backlogOf('t m t')
    const duplicate = { ...list[2]!, backlog_position: list[0]!.backlog_position }
    const shuffled = [list[1]!, duplicate, list[0]!]
    const updates = reorderWithin(shuffled, ['t1', 't3'], 't3', 0)
    const result = apply(shuffled, updates)

    expect(ids(result)).toEqual(['t3', 't1', 'm2'])
    const keys = result.map((row) => row.backlog_position)
    expect(new Set(keys).size).toBe(keys.length)
  })
})
