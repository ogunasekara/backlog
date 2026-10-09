/**
 * TMDB client and normalizers (movies and TV).
 * Docs: https://developer.themoviedb.org/reference/intro/getting-started
 */
import { fetchJson, toBlurb, yearFrom } from './http.ts'
import type { NormalizedMedia, SearchResult, TvDetails } from './types.ts'

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

type TmdbTvDetail = TmdbTvHit & {
  seasons?: TmdbSeason[]
  episode_run_time?: number[]
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
 * The counts array is indexed by season number minus one.
 */
export function seasonEpisodeCounts(seasons: TmdbSeason[] | undefined): number[] {
  return (seasons ?? [])
    .filter((season) => (season.season_number ?? 0) > 0)
    .sort((a, b) => (a.season_number ?? 0) - (b.season_number ?? 0))
    .map((season) => season.episode_count ?? 0)
}

export function normalizeTvDetail(detail: TmdbTvDetail): NormalizedMedia {
  const title = detail.name?.trim() || detail.original_name?.trim()
  if (!detail.id || !title) throw new Error('TMDB TV detail is missing an id or title')
  const details: TvDetails = { season_episode_counts: seasonEpisodeCounts(detail.seasons) }
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
