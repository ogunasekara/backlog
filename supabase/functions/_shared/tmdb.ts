/**
 * TMDB client and normalizers (movies and TV).
 * Docs: https://developer.themoviedb.org/reference/intro/getting-started
 */
import { fetchJson, toBlurb, yearFrom } from './http.ts'
import type { NormalizedMedia, SearchResult, TvDetails, TvEpisodeRef } from './types.ts'

const API = 'https://api.themoviedb.org/3'
const IMAGE_BASE = 'https://image.tmdb.org/t/p/w500'

// ---------------------------------------------------------------------------
// Upstream response shapes (only the fields we use)
// ---------------------------------------------------------------------------

type TmdbMovieHit = {
  id: number
  title?: string
  original_title?: string
  release_date?: string
  poster_path?: string | null
  overview?: string
}

type TmdbTvHit = {
  id: number
  name?: string
  original_name?: string
  first_air_date?: string
  poster_path?: string | null
  overview?: string
}

type TmdbPage<T> = { results?: T[] }

type TmdbMovieDetail = TmdbMovieHit & { runtime?: number | null }

type TmdbSeason = { season_number?: number; episode_count?: number }

type TmdbEpisode = { season_number?: number; episode_number?: number; air_date?: string | null }

type TmdbTvDetail = TmdbTvHit & {
  seasons?: TmdbSeason[]
  episode_run_time?: number[]
  status?: string
  in_production?: boolean
  last_episode_to_air?: TmdbEpisode | null
  next_episode_to_air?: TmdbEpisode | null
}

export function coverUrl(posterPath: string | null | undefined): string | undefined {
  return posterPath ? `${IMAGE_BASE}${posterPath}` : undefined
}

// ---------------------------------------------------------------------------
// Normalizers (pure)
// ---------------------------------------------------------------------------

export function normalizeMovieHit(hit: TmdbMovieHit): SearchResult | null {
  const title = hit.title?.trim() || hit.original_title?.trim()
  if (!hit.id || !title) return null
  return {
    type: 'movie',
    source: 'tmdb',
    externalId: String(hit.id),
    title,
    year: yearFrom(hit.release_date) ?? undefined,
    coverUrl: coverUrl(hit.poster_path),
    blurb: toBlurb(hit.overview),
  }
}

export function normalizeTvHit(hit: TmdbTvHit): SearchResult | null {
  const title = hit.name?.trim() || hit.original_name?.trim()
  if (!hit.id || !title) return null
  return {
    type: 'tv',
    source: 'tmdb',
    externalId: String(hit.id),
    title,
    year: yearFrom(hit.first_air_date) ?? undefined,
    coverUrl: coverUrl(hit.poster_path),
    blurb: toBlurb(hit.overview),
  }
}

export function normalizeMovieSearch(page: TmdbPage<TmdbMovieHit>): SearchResult[] {
  return (page.results ?? []).map(normalizeMovieHit).filter((r): r is SearchResult => r !== null)
}

export function normalizeTvSearch(page: TmdbPage<TmdbTvHit>): SearchResult[] {
  return (page.results ?? []).map(normalizeTvHit).filter((r): r is SearchResult => r !== null)
}

export function normalizeMovieDetail(detail: TmdbMovieDetail): NormalizedMedia {
  const title = detail.title?.trim() || detail.original_title?.trim()
  if (!detail.id || !title) throw new Error('TMDB movie detail is missing an id or title')
  return {
    type: 'movie',
    source: 'tmdb',
    external_id: String(detail.id),
    title,
    year: yearFrom(detail.release_date),
    description: detail.overview?.trim() || null,
    cover_url: coverUrl(detail.poster_path) ?? null,
    details: detail.runtime ? { runtime_minutes: detail.runtime } : {},
  }
}

/**
 * Season 0 holds specials, which the "next episode" pointer skips, so it is dropped.
 * The counts array is indexed by season number minus one; a season TMDB doesn't list
 * (or lists without a count) is 0, so later seasons keep their numbers.
 */
export function seasonEpisodeCounts(seasons: TmdbSeason[] | undefined): number[] {
  const counts: number[] = []
  for (const { season_number, episode_count } of seasons ?? []) {
    if (!season_number || season_number < 1 || !Number.isInteger(season_number)) continue
    counts[season_number - 1] = Math.max(0, episode_count ?? 0)
  }
  return Array.from(counts, (count) => count ?? 0)
}

/** A regular-season episode reference; specials (season 0) and malformed ones are null. */
function episodeRef(episode: TmdbEpisode | null | undefined): TvEpisodeRef | null {
  const season = episode?.season_number
  const number = episode?.episode_number
  if (!Number.isInteger(season) || !Number.isInteger(number)) return null
  if (season! < 1 || number! < 1) return null
  return { season: season!, episode: number! }
}

/** No more episodes are coming. With no status, a show out of production counts as ended. */
export function hasEnded(detail: Pick<TmdbTvDetail, 'status' | 'in_production'>): boolean {
  if (detail.status) return detail.status === 'Ended' || detail.status === 'Canceled'
  return detail.in_production === false
}

export function normalizeTvDetail(detail: TmdbTvDetail): NormalizedMedia {
  const title = detail.name?.trim() || detail.original_name?.trim()
  if (!detail.id || !title) throw new Error('TMDB TV detail is missing an id or title')
  // TMDB lists a whole season's episodes before they air, so the aired range is kept
  // alongside the counts.
  const next = episodeRef(detail.next_episode_to_air)
  const details: TvDetails = {
    season_episode_counts: seasonEpisodeCounts(detail.seasons),
    last_aired: episodeRef(detail.last_episode_to_air),
    next_air: next && { ...next, air_date: detail.next_episode_to_air?.air_date || null },
    ended: hasEnded(detail),
  }
  const runtime = detail.episode_run_time?.find((minutes) => minutes > 0)
  if (runtime) details.episode_runtime_minutes = runtime
  return {
    type: 'tv',
    source: 'tmdb',
    external_id: String(detail.id),
    title,
    year: yearFrom(detail.first_air_date),
    description: detail.overview?.trim() || null,
    cover_url: coverUrl(detail.poster_path) ?? null,
    details,
  }
}

// ---------------------------------------------------------------------------
// Client
// ---------------------------------------------------------------------------

/**
 * TMDB accepts either a v4 read access token (a JWT, sent as a bearer token) or a
 * v3 API key (a query parameter). Both are called "API key" in the dashboard, so
 * the shape of the value decides how it is sent.
 */
function requestInit(key: string): { url: (path: string) => string; init: RequestInit } {
  const isBearerToken = key.startsWith('eyJ')
  return {
    url: (path) =>
      `${API}${path}${isBearerToken ? '' : `${path.includes('?') ? '&' : '?'}api_key=${key}`}`,
    init: {
      headers: {
        accept: 'application/json',
        ...(isBearerToken ? { authorization: `Bearer ${key}` } : {}),
      },
    },
  }
}

export async function searchMovies(key: string, query: string): Promise<SearchResult[]> {
  const { url, init } = requestInit(key)
  const page = await fetchJson<TmdbPage<TmdbMovieHit>>(
    url(
      `/search/movie?query=${encodeURIComponent(query)}&include_adult=false&language=en-US&page=1`,
    ),
    init,
  )
  return normalizeMovieSearch(page)
}

export async function searchTv(key: string, query: string): Promise<SearchResult[]> {
  const { url, init } = requestInit(key)
  const page = await fetchJson<TmdbPage<TmdbTvHit>>(
    url(`/search/tv?query=${encodeURIComponent(query)}&include_adult=false&language=en-US&page=1`),
    init,
  )
  return normalizeTvSearch(page)
}

export async function movieDetails(key: string, externalId: string): Promise<NormalizedMedia> {
  const { url, init } = requestInit(key)
  return normalizeMovieDetail(
    await fetchJson<TmdbMovieDetail>(
      url(`/movie/${encodeURIComponent(externalId)}?language=en-US`),
      init,
    ),
  )
}

export async function tvDetails(key: string, externalId: string): Promise<NormalizedMedia> {
  const { url, init } = requestInit(key)
  return normalizeTvDetail(
    await fetchJson<TmdbTvDetail>(
      url(`/tv/${encodeURIComponent(externalId)}?language=en-US`),
      init,
    ),
  )
}
