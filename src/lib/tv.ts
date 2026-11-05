import type { Entry, Media } from '@/lib/types'

/**
 * The last episode watched. Episode 0 means nothing from that season yet, so a new
 * entry's S1E0 reads as "not started".
 */
export type EpisodePointer = { season: number; episode: number }

export function pointerOf(entry: Pick<Entry, 'tv_season' | 'tv_episode'>): EpisodePointer {
  return { season: entry.tv_season, episode: entry.tv_episode }
}

/**
 * Episodes per season from the metadata, indexed by season number minus one. Null when
 * there's nothing usable (a custom show, or a catalog show with no episodes yet), in
 * which case the pointer just counts up with no seasons to roll over.
 */
export function seasonCountsOf(media: Pick<Media, 'details'>): number[] | null {
  const counts = media.details.season_episode_counts
  if (!Array.isArray(counts)) return null
  if (!counts.every((count) => typeof count === 'number' && Number.isInteger(count) && count >= 0))
    return null
  return counts.some((count) => count > 0) ? (counts as number[]) : null
}

/** The last season that has any episodes. Only call with counts from `seasonCountsOf`. */
function lastSeason(counts: number[]): number {
  for (let season = counts.length; season > 1; season--) {
    if (counts[season - 1]! > 0) return season
  }
  return 1
}

/**
 * Pulls a pointer back inside the known episodes, e.g. after a refresh shrinks a
 * season's count. A pointer past the end lands on the last episode.
 */
export function clampPointer(pointer: EpisodePointer, counts: number[] | null): EpisodePointer {
  const season = Math.max(1, pointer.season)
  const episode = Math.max(0, pointer.episode)
  if (!counts) return { season, episode }
  if (season > counts.length) {
    const last = lastSeason(counts)
    return { season: last, episode: counts[last - 1]! }
  }
  return { season, episode: Math.min(episode, counts[season - 1]!) }
}

/**
 * The episode after the pointer, rolling over to the next season that has episodes.
 * Null once the last episode is watched.
 */
export function nextEpisode(
  pointer: EpisodePointer,
  counts: number[] | null,
): EpisodePointer | null {
  const { season, episode } = clampPointer(pointer, counts)
  if (!counts || episode < counts[season - 1]!) return { season, episode: episode + 1 }
  for (let next = season + 1; next <= counts.length; next++) {
    if (counts[next - 1]! > 0) return { season: next, episode: 1 }
  }
  return null
}

/** A scheduled episode and its air date (`YYYY-MM-DD`), if TMDB has one. */
export type ScheduledEpisode = EpisodePointer & { airDate: string | null }

/**
 * What the metadata says about a show's episodes. TMDB lists a season's episodes before
 * they air, so `counts` alone would offer episodes that don't exist yet.
 */
export type TvShow = {
  /** Listed episodes per season; null when unknown (a custom show). */
  counts: number[] | null
  /** The latest aired episode. `undefined` when not recorded (custom shows, older rows). */
  lastAired: EpisodePointer | null | undefined
  nextAir: ScheduledEpisode | null | undefined
  /** No more episodes are coming. Assumed when not recorded, as before Phase 6. */
  ended: boolean
}

function readEpisode(value: unknown): EpisodePointer | null {
  if (typeof value !== 'object' || value === null) return null
  const { season, episode } = value as Record<string, unknown>
  return Number.isInteger(season) && Number.isInteger(episode)
    ? { season: season as number, episode: episode as number }
    : null
}

export function tvShowOf(media: Pick<Media, 'details'>): TvShow {
  const { last_aired, next_air, ended } = media.details
  const next = readEpisode(next_air)
  const airDate = (next_air as { air_date?: unknown } | null | undefined)?.air_date
  return {
    counts: seasonCountsOf(media),
    lastAired: last_aired === undefined ? undefined : readEpisode(last_aired),
    nextAir:
      next_air === undefined
        ? undefined
        : next && { ...next, airDate: typeof airDate === 'string' ? airDate : null },
    ended: typeof ended === 'boolean' ? ended : true,
  }
}

function compare(a: EpisodePointer, b: EpisodePointer): number {
  return a.season - b.season || a.episode - b.episode
}

/**
 * Whether an episode has aired. The next scheduled episode counts once its air date
 * arrives (local time), since the metadata is only as fresh as the last refresh.
 */
export function hasAired(episode: EpisodePointer, show: TvShow, today: string): boolean {
  const { lastAired, nextAir } = show
  if (lastAired === undefined && nextAir === undefined) return true
  if (lastAired && compare(episode, lastAired) <= 0) return true
  if (nextAir) {
    const order = compare(episode, nextAir)
    if (order < 0) return true
    return order === 0 && nextAir.airDate !== null && nextAir.airDate <= today
  }
  // Nothing scheduled: past the last aired episode, or nothing aired at all.
  return lastAired ? false : show.ended
}

export type Upcoming =
  /** The next episode, ready to watch. */
  | { kind: 'next'; episode: EpisodePointer }
  /** The next episode hasn't aired; `airDate` when it's scheduled. */
  | { kind: 'unaired'; episode: EpisodePointer; airDate: string | null }
  /** Every listed episode watched, but the show isn't over. */
  | { kind: 'caught_up' }
  /** Every episode watched and the show has ended: time to mark it Completed. */
  | { kind: 'finished' }

export function upcoming(pointer: EpisodePointer, show: TvShow, today: string): Upcoming {
  const next = nextEpisode(pointer, show.counts)
  const { nextAir } = show
  if (next) {
    if (hasAired(next, show, today)) return { kind: 'next', episode: next }
    const scheduled = nextAir && compare(next, nextAir) === 0
    return { kind: 'unaired', episode: next, airDate: scheduled ? nextAir.airDate : null }
  }
  // Past the listed episodes; a scheduled one may not be listed yet.
  if (nextAir && compare(nextAir, pointer) > 0) {
    const { season, episode, airDate } = nextAir
    return { kind: 'unaired', episode: { season, episode }, airDate }
  }
  return show.ended ? { kind: 'finished' } : { kind: 'caught_up' }
}

/** Whether a manually entered position fits the known seasons and episodes. */
export function isValidPointer(pointer: EpisodePointer, counts: number[] | null): boolean {
  const { season, episode } = pointer
  if (!Number.isInteger(season) || !Number.isInteger(episode)) return false
  if (season < 1 || episode < 0) return false
  if (!counts) return true
  return season <= counts.length && episode <= counts[season - 1]!
}

export function formatEpisode({ season, episode }: EpisodePointer): string {
  return `S${season} E${episode}`
}
