import { describe, expect, it } from 'vitest'
import { makeEntry } from '@/test/fixtures'
import { applyLibraryView, parseLibraryView } from './filters'

describe('parseLibraryView', () => {
  it('reads type, status and sort from the URL', () => {
    expect(
      parseLibraryView(new URLSearchParams('type=book&status=in_progress&sort=title')),
    ).toEqual({ type: 'book', status: 'in_progress', sort: 'title' })
  })

  it('accepts last updated with or without a status filter', () => {
    expect(parseLibraryView(new URLSearchParams('sort=updated')).sort).toBe('updated')
    expect(parseLibraryView(new URLSearchParams('status=backlog&sort=updated')).sort).toBe(
      'updated',
    )
  })

  it('falls back to everything, newest first, for missing or unknown values', () => {
    expect(parseLibraryView(new URLSearchParams('type=podcast&status=x&sort=y'))).toEqual({
      type: null,
      status: null,
      sort: 'updated',
    })
  })
})

describe('backlog order', () => {
  it('is the default, and only valid, when filtering to the backlog', () => {
    expect(parseLibraryView(new URLSearchParams('status=backlog')).sort).toBe('position')
    expect(parseLibraryView(new URLSearchParams('status=backlog&sort=title')).sort).toBe('title')
    expect(parseLibraryView(new URLSearchParams('status=completed&sort=position')).sort).toBe(
      'updated',
    )
    expect(parseLibraryView(new URLSearchParams('sort=position')).sort).toBe('updated')
  })

  it('sorts by backlog position', () => {
    const second = makeEntry({ backlog_position: 'a1' }, { title: 'Second' })
    const first = makeEntry({ backlog_position: 'Zz' }, { title: 'First' })
    const third = makeEntry({ backlog_position: 'a1V' }, { title: 'Third' })
    const sorted = applyLibraryView([second, third, first], {
      type: null,
      status: 'backlog',
      sort: 'position',
    })
    expect(sorted.map((entry) => entry.media.title)).toEqual(['First', 'Second', 'Third'])
  })
})

describe('applyLibraryView', () => {
  const dune = makeEntry(
    { status: 'completed', rating: 9, created_at: '2026-10-01T00:00:00Z' },
    { type: 'book', title: 'Dune' },
  )
  const alien = makeEntry(
    { status: 'backlog', created_at: '2026-10-03T00:00:00Z' },
    { type: 'movie', title: 'alien' },
  )
  const zelda = makeEntry(
    { status: 'in_progress', rating: 6, created_at: '2026-10-02T00:00:00Z' },
    { type: 'game', title: 'Zelda' },
  )
  const heat = makeEntry(
    { status: 'completed', rating: 9, created_at: '2026-10-04T00:00:00Z' },
    { type: 'movie', title: 'Heat' },
  )
  const all = [dune, alien, zelda, heat]
  const titles = (entries: typeof all) => entries.map((entry) => entry.media.title)

  it('sorts newest first by default', () => {
    expect(titles(applyLibraryView(all, { type: null, status: null, sort: 'added' }))).toEqual([
      'Heat',
      'alien',
      'Zelda',
      'Dune',
    ])
  })

  it('sorts by last updated, most recent first, ties by newest added', () => {
    const edited = makeEntry(
      { created_at: '2026-10-01T00:00:00Z', updated_at: '2026-11-05T00:00:00Z' },
      { title: 'Edited' },
    )
    const olderTie = makeEntry(
      { created_at: '2026-10-02T00:00:00Z', updated_at: '2026-11-01T00:00:00Z' },
      { title: 'Older tie' },
    )
    const newerTie = makeEntry(
      { created_at: '2026-10-03T00:00:00Z', updated_at: '2026-11-01T00:00:00Z' },
      { title: 'Newer tie' },
    )
    expect(
      titles(
        applyLibraryView([olderTie, newerTie, edited], {
          type: null,
          status: null,
          sort: 'updated',
        }),
      ),
    ).toEqual(['Edited', 'Newer tie', 'Older tie'])
  })

  it('sorts by title ignoring case', () => {
    expect(titles(applyLibraryView(all, { type: null, status: null, sort: 'title' }))).toEqual([
      'alien',
      'Dune',
      'Heat',
      'Zelda',
    ])
  })

  it('sorts by rating, highest first, unrated last, ties by title', () => {
    expect(titles(applyLibraryView(all, { type: null, status: null, sort: 'rating' }))).toEqual([
      'Dune',
      'Heat',
      'Zelda',
      'alien',
    ])
  })

  it('filters by type and status together', () => {
    expect(titles(applyLibraryView(all, { type: 'movie', status: null, sort: 'added' }))).toEqual([
      'Heat',
      'alien',
    ])
    expect(
      titles(applyLibraryView(all, { type: 'movie', status: 'completed', sort: 'added' })),
    ).toEqual(['Heat'])
  })

  it('does not reorder the array it was given', () => {
    const input = [...all]
    applyLibraryView(input, { type: null, status: null, sort: 'title' })
    expect(input).toEqual(all)
  })
})
