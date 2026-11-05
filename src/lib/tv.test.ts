import { describe, expect, it } from 'vitest'
import {
  clampPointer,
  isValidPointer,
  nextEpisode,
  seasonCountsOf,
  tvShowOf,
  upcoming,
  type EpisodePointer,
  type TvShow,
} from './tv'

const at = (season: number, episode: number): EpisodePointer => ({ season, episode })

describe('seasonCountsOf', () => {
  it('reads the per-season counts from the metadata', () => {
    expect(seasonCountsOf({ details: { season_episode_counts: [7, 13] } })).toEqual([7, 13])
  })

  it('treats missing, malformed or empty counts as unknown', () => {
    expect(seasonCountsOf({ details: {} })).toBeNull()
    expect(seasonCountsOf({ details: { season_episode_counts: 'x' } })).toBeNull()
    expect(seasonCountsOf({ details: { season_episode_counts: [3, 1.5] } })).toBeNull()
    expect(seasonCountsOf({ details: { season_episode_counts: [3, -1] } })).toBeNull()
    expect(seasonCountsOf({ details: { season_episode_counts: [] } })).toBeNull()
    expect(seasonCountsOf({ details: { season_episode_counts: [0, 0] } })).toBeNull()
  })
})

describe('nextEpisode', () => {
  const counts = [3, 2]

  it('starts a new entry on S1E1', () => {
    expect(nextEpisode(at(1, 0), counts)).toEqual(at(1, 1))
  })

  it('steps within a season', () => {
    expect(nextEpisode(at(1, 1), counts)).toEqual(at(1, 2))
  })

  it('rolls over to the next season after its last episode', () => {
    expect(nextEpisode(at(1, 3), counts)).toEqual(at(2, 1))
  })

  it('returns null after the final episode', () => {
    expect(nextEpisode(at(2, 2), counts)).toBeNull()
  })

  it('steps through a whole multi-season show in order and then finishes', () => {
    const seen: string[] = []
    let pointer: EpisodePointer | null = at(1, 0)
    while ((pointer = nextEpisode(pointer, [2, 3, 1])))
      seen.push(`${pointer.season}.${pointer.episode}`)
    expect(seen).toEqual(['1.1', '1.2', '2.1', '2.2', '2.3', '3.1'])
  })

  it('skips seasons with no episodes, such as an announced one', () => {
    expect(nextEpisode(at(1, 3), [3, 0, 4])).toEqual(at(3, 1))
    expect(nextEpisode(at(1, 0), [0, 4])).toEqual(at(2, 1))
    expect(nextEpisode(at(1, 3), [3, 0])).toBeNull()
  })

  it('works from a pointer a refresh left out of range', () => {
    // Season 1 shrank from 5 to 3: S1E5 clamps to S1E3, so next is S2E1.
    expect(nextEpisode(at(1, 5), counts)).toEqual(at(2, 1))
    // The show lost a season: past the end clamps to the final episode.
    expect(nextEpisode(at(4, 1), counts)).toBeNull()
  })

  it('counts up with no rollover when the seasons are unknown', () => {
    expect(nextEpisode(at(1, 0), null)).toEqual(at(1, 1))
    expect(nextEpisode(at(2, 41), null)).toEqual(at(2, 42))
  })
})

describe('clampPointer', () => {
  it('leaves a valid pointer alone', () => {
    expect(clampPointer(at(2, 1), [3, 2])).toEqual(at(2, 1))
    expect(clampPointer(at(2, 0), [3, 2])).toEqual(at(2, 0))
  })

  it('caps the episode at the season length', () => {
    expect(clampPointer(at(1, 9), [3, 2])).toEqual(at(1, 3))
  })

  it('moves a pointer past the last season to the final episode', () => {
    expect(clampPointer(at(5, 2), [3, 2])).toEqual(at(2, 2))
    // The final season with any episodes, not an empty announced one.
    expect(clampPointer(at(5, 2), [3, 2, 0])).toEqual(at(2, 2))
  })
})

describe('isValidPointer', () => {
  it('accepts positions inside the known episodes, including episode 0', () => {
    expect(isValidPointer(at(1, 0), [3, 2])).toBe(true)
    expect(isValidPointer(at(2, 2), [3, 2])).toBe(true)
  })

  it('rejects positions outside them', () => {
    expect(isValidPointer(at(0, 1), [3, 2])).toBe(false)
    expect(isValidPointer(at(3, 1), [3, 2])).toBe(false)
    expect(isValidPointer(at(1, 4), [3, 2])).toBe(false)
    expect(isValidPointer(at(1, -1), [3, 2])).toBe(false)
    expect(isValidPointer(at(1, 1.5), [3, 2])).toBe(false)
  })

  it('accepts any whole position when the seasons are unknown', () => {
    expect(isValidPointer(at(9, 120), null)).toBe(true)
    expect(isValidPointer(at(0, 1), null)).toBe(false)
  })
})

describe('tvShowOf', () => {
  it('reads the aired range and ended flag', () => {
    expect(
      tvShowOf({
        details: {
          season_episode_counts: [10],
          last_aired: { season: 1, episode: 2 },
          next_air: { season: 1, episode: 3, air_date: '2026-11-05' },
          ended: false,
        },
      }),
    ).toEqual({
      counts: [10],
      lastAired: at(1, 2),
      nextAir: { ...at(1, 3), airDate: '2026-11-05' },
      ended: false,
    })
  })

  it('treats metadata saved before the aired range as fully aired and ended', () => {
    expect(tvShowOf({ details: { season_episode_counts: [3] } })).toEqual({
      counts: [3],
      lastAired: undefined,
      nextAir: undefined,
      ended: true,
    })
  })

  it('keeps "nothing aired" (null) distinct from "not recorded"', () => {
    const show = tvShowOf({
      details: { season_episode_counts: [8], last_aired: null, next_air: null, ended: false },
    })
    expect(show).toMatchObject({ lastAired: null, nextAir: null })
  })
})

describe('upcoming', () => {
  const TODAY = '2026-11-04'
  // Nocturne on 2026-11-05: 10 listed, 2 aired, episode 3 due.
  const airing: TvShow = {
    counts: [10],
    lastAired: at(1, 2),
    nextAir: { ...at(1, 3), airDate: '2026-11-05' },
    ended: false,
  }

  it('offers aired episodes', () => {
    expect(upcoming(at(1, 0), airing, TODAY)).toEqual({ kind: 'next', episode: at(1, 1) })
    expect(upcoming(at(1, 1), airing, TODAY)).toEqual({ kind: 'next', episode: at(1, 2) })
  })

  it('holds at the next scheduled episode until its air date', () => {
    expect(upcoming(at(1, 2), airing, TODAY)).toEqual({
      kind: 'unaired',
      episode: at(1, 3),
      airDate: '2026-11-05',
    })
    expect(upcoming(at(1, 2), airing, '2026-11-05')).toEqual({ kind: 'next', episode: at(1, 3) })
  })

  it("doesn't offer episodes past the scheduled one, even on its air date", () => {
    expect(upcoming(at(1, 3), airing, '2026-11-05')).toEqual({
      kind: 'unaired',
      episode: at(1, 4),
      airDate: null,
    })
  })

  it('is caught up, not finished, at the end of a show that is still going', () => {
    const between: TvShow = { counts: [8], lastAired: at(1, 8), nextAir: null, ended: false }
    expect(upcoming(at(1, 8), between, TODAY)).toEqual({ kind: 'caught_up' })
  })

  it('is finished at the end of a show that has ended', () => {
    const ended: TvShow = { counts: [8], lastAired: at(1, 8), nextAir: null, ended: true }
    expect(upcoming(at(1, 7), ended, TODAY)).toEqual({ kind: 'next', episode: at(1, 8) })
    expect(upcoming(at(1, 8), ended, TODAY)).toEqual({ kind: 'finished' })
  })

  it('points at a scheduled episode that TMDB hasn’t listed yet', () => {
    const renewed: TvShow = {
      counts: [8],
      lastAired: at(1, 8),
      nextAir: { ...at(2, 1), airDate: '2027-01-10' },
      ended: false,
    }
    expect(upcoming(at(1, 8), renewed, TODAY)).toEqual({
      kind: 'unaired',
      episode: at(2, 1),
      airDate: '2027-01-10',
    })
  })

  it('offers nothing for a show with nothing aired yet', () => {
    const planned: TvShow = { counts: [8], lastAired: null, nextAir: null, ended: false }
    expect(upcoming(at(1, 0), planned, TODAY)).toEqual({
      kind: 'unaired',
      episode: at(1, 1),
      airDate: null,
    })
  })

  it('treats older metadata as fully aired, finishing at the last episode', () => {
    const older = tvShowOf({ details: { season_episode_counts: [2] } })
    expect(upcoming(at(1, 1), older, TODAY)).toEqual({ kind: 'next', episode: at(1, 2) })
    expect(upcoming(at(1, 2), older, TODAY)).toEqual({ kind: 'finished' })
  })

  it('counts up without limit for a custom show', () => {
    const custom = tvShowOf({ details: {} })
    expect(upcoming(at(3, 9), custom, TODAY)).toEqual({ kind: 'next', episode: at(3, 10) })
  })
})
