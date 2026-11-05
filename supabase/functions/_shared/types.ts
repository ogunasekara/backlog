/** Shared types for the metadata proxy. Pure types only, no runtime imports. */

export type MediaType = 'movie' | 'tv' | 'book' | 'game'

/** Sources that come from an external API. Custom items never reach the edge functions. */
export type CatalogSource = 'tmdb' | 'igdb' | 'google_books'

/** A normalized search hit, as returned by the `search` function. */
export type SearchResult = {
  type: MediaType
  source: CatalogSource
  externalId: string
  title: string
  year?: number
  coverUrl?: string
  blurb?: string
}

/** Type-specific metadata stored in `media.details`. */
export type MovieDetails = { runtime_minutes?: number }
export type TvEpisodeRef = { season: number; episode: number }
export type TvDetails = {
  /** Episodes TMDB lists per season (season number minus one), including unaired ones. */
  season_episode_counts: number[]
  /** The latest aired episode; null if none has aired. Missing on rows saved before Phase 6. */
  last_aired?: TvEpisodeRef | null
  /** The next scheduled episode, with its air date (YYYY-MM-DD); null if none is scheduled. */
  next_air?: (TvEpisodeRef & { air_date: string | null }) | null
  /** Ended or canceled: no more episodes are coming. */
  ended?: boolean
  episode_runtime_minutes?: number
}
export type BookDetails = { page_count?: number; authors?: string[] }
export type GameDetails = { platforms?: string[] }

export type MediaDetailsPayload = MovieDetails | TvDetails | BookDetails | GameDetails

/** A normalized full record, ready to upsert into `media`. */
export type NormalizedMedia = {
  type: MediaType
  source: CatalogSource
  external_id: string
  title: string
  year: number | null
  description: string | null
  cover_url: string | null
  details: MediaDetailsPayload
}

export type SearchScope = MediaType | 'all'

export type SourceError = { source: CatalogSource; type: MediaType; message: string }

export type SearchResponse = {
  results: SearchResult[]
  /** Present when one or more sources failed; the rest of the results are still usable. */
  errors?: SourceError[]
}
