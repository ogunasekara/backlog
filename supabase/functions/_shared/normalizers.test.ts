import { describe, expect, it, vi } from 'vitest'
import booksSearch from './__fixtures__/google-books-search.json'
import booksVolume from './__fixtures__/google-books-volume.json'
import igdbDetail from './__fixtures__/igdb-game-detail.json'
import igdbSearch from './__fixtures__/igdb-search-games.json'
import tmdbMovieDetail from './__fixtures__/tmdb-movie-detail.json'
import tmdbMovieSearch from './__fixtures__/tmdb-search-movie.json'
import tmdbTvSearch from './__fixtures__/tmdb-search-tv.json'
import tmdbTvDetail from './__fixtures__/tmdb-tv-detail.json'
import tmdbTvDetailAiring from './__fixtures__/tmdb-tv-detail-airing.json'
import * as books from './google-books.ts'
import { fetchJson, HttpError, toBlurb, yearFrom } from './http.ts'
import * as igdb from './igdb.ts'
import * as tmdb from './tmdb.ts'

describe('http helpers', () => {
  it.each([
    ['2010-07-15', 2010],
    ['2011', 2011],
    ['2008-09', 2008],
    ['', null],
    [undefined, null],
    ['n/a', null],
  ])('yearFrom(%s) is %s', (input, expected) => {
    expect(yearFrom(input)).toBe(expected)
  })

  it('leaves a short blurb alone and drops empty text', () => {
    expect(toBlurb('  Short summary. ')).toBe('Short summary.')
    expect(toBlurb('   ')).toBeUndefined()
    expect(toBlurb(null)).toBeUndefined()
  })

  it('truncates a long blurb on a word boundary', () => {
    expect(toBlurb(`${'word '.repeat(80)}end`, 40)).toBe('word word word word word word word word…')
  })

  it('truncates mid-word when there is no space late enough to break on', () => {
    expect(toBlurb('a'.repeat(50), 40)).toBe(`${'a'.repeat(40)}…`)
  })
})

describe('TMDB movies', () => {
  it('normalizes a search page and drops malformed rows', () => {
    const results = tmdb.normalizeMovieSearch(tmdbMovieSearch)
    expect(results).toHaveLength(2)
    expect(results[0]).toEqual({
      type: 'movie',
      source: 'tmdb',
      externalId: '27205',
      title: 'Inception',
      year: 2010,
      coverUrl: 'https://image.tmdb.org/t/p/w500/oYuLEt3zVCKq57qu2F8dT7NIa6f.jpg',
      blurb: expect.stringContaining('Cobb, a skilled thief'),
    })
  })

  it('omits year and cover when the source has none', () => {
    const [, second] = tmdb.normalizeMovieSearch(tmdbMovieSearch)
    expect(second.year).toBeUndefined()
    expect(second.coverUrl).toBeUndefined()
  })

  it('normalizes details with the runtime', () => {
    expect(tmdb.normalizeMovieDetail(tmdbMovieDetail)).toEqual({
      type: 'movie',
      source: 'tmdb',
      external_id: '27205',
      title: 'Inception',
      year: 2010,
      description: expect.stringContaining('Cobb, a skilled thief'),
      cover_url: 'https://image.tmdb.org/t/p/w500/oYuLEt3zVCKq57qu2F8dT7NIa6f.jpg',
      details: { runtime_minutes: 148 },
    })
  })

  it('rejects details with no usable title', () => {
    expect(() => tmdb.normalizeMovieDetail({ id: 1, title: '  ' })).toThrow(
      /missing an id or title/,
    )
  })
})

describe('TMDB TV', () => {
  it('falls back to the original name when the localized name is empty', () => {
    const results = tmdb.normalizeTvSearch(tmdbTvSearch)
    expect(results.map((r) => r.title)).toEqual([
      'Breaking Bad',
      'Breaking Bad: Original Minisodes',
    ])
    expect(results[0].type).toBe('tv')
  })

  it('builds season episode counts in season order, skipping specials', () => {
    const media = tmdb.normalizeTvDetail(tmdbTvDetail)
    expect(media.details).toEqual({
      season_episode_counts: [7, 13, 13, 13, 16],
      last_aired: { season: 5, episode: 16 },
      next_air: null,
      ended: true,
      episode_runtime_minutes: 47,
    })
  })

  it('keeps the aired range of a show that is still airing', () => {
    expect(tmdb.normalizeTvDetail(tmdbTvDetailAiring).details).toEqual({
      season_episode_counts: [10],
      last_aired: { season: 1, episode: 2 },
      next_air: { season: 1, episode: 3, air_date: '2026-11-05' },
      ended: false,
    })
  })

  it('ignores specials and malformed episodes in the aired range', () => {
    const details = tmdb.normalizeTvDetail({
      ...tmdbTvDetailAiring,
      last_episode_to_air: { season_number: 0, episode_number: 4, air_date: '2026-10-30' },
      next_episode_to_air: { season_number: 1, air_date: '2026-11-05' },
    }).details
    expect(details).toMatchObject({ last_aired: null, next_air: null })
  })

  it('reads ended and canceled shows as finished, and falls back to in_production', () => {
    expect(tmdb.hasEnded({ status: 'Ended' })).toBe(true)
    expect(tmdb.hasEnded({ status: 'Canceled' })).toBe(true)
    expect(tmdb.hasEnded({ status: 'Returning Series', in_production: false })).toBe(false)
    expect(tmdb.hasEnded({ status: 'Planned' })).toBe(false)
    expect(tmdb.hasEnded({ in_production: false })).toBe(true)
    expect(tmdb.hasEnded({})).toBe(false)
  })

  it('handles a show with no seasons listed', () => {
    expect(tmdb.seasonEpisodeCounts(undefined)).toEqual([])
    expect(tmdb.seasonEpisodeCounts([{ season_number: 0, episode_count: 5 }])).toEqual([])
  })

  it('defaults a missing episode count to zero rather than dropping the season', () => {
    expect(
      tmdb.seasonEpisodeCounts([{ season_number: 1 }, { season_number: 2, episode_count: 4 }]),
    ).toEqual([0, 4])
  })

  it('keeps season numbers when a season is missing from the list', () => {
    expect(
      tmdb.seasonEpisodeCounts([
        { season_number: 3, episode_count: 8 },
        { season_number: 1, episode_count: 10 },
      ]),
    ).toEqual([10, 0, 8])
  })
})

describe('IGDB', () => {
  it('normalizes a search response and drops malformed rows', () => {
    const results = igdb.normalizeGameSearch(igdbSearch)
    expect(results).toHaveLength(2)
    expect(results[0]).toEqual({
      type: 'game',
      source: 'igdb',
      externalId: '1942',
      title: 'The Witcher 2: Assassins of Kings',
      year: 2010,
      coverUrl: 'https://images.igdb.com/igdb/image/upload/t_cover_big/co1wyy.jpg',
      blurb: expect.stringContaining('role-playing game'),
    })
  })

  it('treats the 1970 epoch release date as a real year and omits a missing cover', () => {
    const [, second] = igdb.normalizeGameSearch(igdbSearch)
    expect(second.year).toBe(1970)
    expect(second.coverUrl).toBeUndefined()
  })

  it('normalizes details with platform names', () => {
    expect(igdb.normalizeGameDetail(igdbDetail[0]).details).toEqual({
      platforms: ['PC (Microsoft Windows)', 'Xbox 360', 'Mac'],
    })
  })

  it.each([
    [undefined, null],
    [null, null],
    [Number.NaN, null],
  ])('yearFromUnixSeconds(%s) is %s', (input, expected) => {
    expect(igdb.yearFromUnixSeconds(input)).toBe(expected)
  })
})

describe('Google Books', () => {
  it('joins the subtitle into the title and forces https covers', () => {
    const results = books.normalizeVolumeSearch(booksSearch)
    expect(results).toHaveLength(2)
    expect(results[0].title).toBe('The Hobbit: Or There and Back Again')
    expect(results[0].coverUrl).toMatch(/^https:\/\/books\.google\.com/)
    expect(results[0].year).toBe(2012)
  })

  it('leads the blurb with the authors', () => {
    const [first] = books.normalizeVolumeSearch(booksSearch)
    expect(first.blurb).toMatch(/^J\. R\. R\. Tolkien — Bilbo Baggins/)
  })

  it('drops a volume with no id', () => {
    expect(books.normalizeVolumeSearch(booksSearch).map((r) => r.externalId)).toEqual([
      'yl4dILkcqm4C',
      'pD6arNyKyi8C',
    ])
  })

  it('normalizes details with the page count and authors', () => {
    expect(books.normalizeVolumeDetail(booksVolume)).toEqual({
      type: 'book',
      source: 'google_books',
      external_id: 'yl4dILkcqm4C',
      title: 'The Hobbit: Or There and Back Again',
      year: 2012,
      description: expect.stringContaining('Bilbo Baggins'),
      cover_url: expect.stringContaining('https://books.google.com'),
      details: { page_count: 320, authors: ['J. R. R. Tolkien', 'Christopher Tolkien'] },
    })
  })

  it('omits page count and authors when absent', () => {
    expect(
      books.normalizeVolumeDetail({ id: 'x', volumeInfo: { title: 'Bare', pageCount: 0 } }).details,
    ).toEqual({})
  })
})

describe('HttpError messages', () => {
  it('truncates a long upstream error body and collapses whitespace', async () => {
    const body = JSON.stringify({ error: { message: 'Quota exceeded.\n'.repeat(80) } })
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(body, { status: 429, statusText: 'Too Many Requests' })),
    )

    let caught: unknown
    try {
      await fetchJson('https://example.test')
    } catch (err) {
      caught = err
    } finally {
      vi.unstubAllGlobals()
    }

    expect(caught).toBeInstanceOf(HttpError)
    const error = caught as HttpError
    expect(error.status).toBe(429)
    expect(error.message).toMatch(/^429 Too Many Requests/)
    expect(error.message.length).toBeLessThan(260)
    expect(error.message).not.toContain('\n')
  })
})
