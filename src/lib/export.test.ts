import { describe, expect, it } from 'vitest'
import { makeEntry } from '@/test/fixtures'
import { buildExport, exportFileName } from './export'

describe('buildExport', () => {
  it('splits entries from their media and lists each media row once', () => {
    const movie = makeEntry({ id: 'a' }, { id: 'm1', title: 'Alien' })
    const book = makeEntry({ id: 'b' }, { id: 'm2', title: 'Dune', type: 'book' })
    // The same media twice can't happen today (one entry per media), but the export
    // shouldn't duplicate it if it ever does.
    const again = makeEntry({ id: 'c', media_id: 'm1' }, { id: 'm1', title: 'Alien' })

    const data = buildExport([movie, book, again], {
      now: new Date('2026-11-05T10:00:00Z'),
      appVersion: 'v0.7.0',
    })

    expect(data).toMatchObject({
      format: 'backlog-export',
      formatVersion: 1,
      exportedAt: '2026-11-05T10:00:00.000Z',
      appVersion: 'v0.7.0',
    })
    expect(data.entries.map((entry) => entry.id)).toEqual(['a', 'b', 'c'])
    expect(data.entries[0]).not.toHaveProperty('media')
    expect(data.entries[0]).toMatchObject({ media_id: 'm1', status: 'backlog' })
    expect(data.media.map((item) => item.id)).toEqual(['m1', 'm2'])
  })

  it('handles an empty library', () => {
    expect(buildExport([])).toMatchObject({ entries: [], media: [] })
  })
})

describe('exportFileName', () => {
  it('uses the local date', () => {
    expect(exportFileName(new Date(2026, 0, 9, 23, 30))).toBe('backlog-export-2026-01-09.json')
  })
})
