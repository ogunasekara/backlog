/**
 * IGDB client and normalizers (games).
 * IGDB authenticates with a Twitch client-credentials token, fetched lazily and
 * cached in memory until it expires or the API rejects it.
 * Docs: https://api-docs.igdb.com/
 */
import { fetchJson, HttpError, toBlurb } from './http.ts'
import type { GameDetails, NormalizedMedia, SearchResult } from './types.ts'

const API = 'https://api.igdb.com/v4/games'
const TOKEN_URL = 'https://id.twitch.tv/oauth2/token'
const IMAGE_BASE = 'https://images.igdb.com/igdb/image/upload'

const SEARCH_FIELDS = 'name,summary,first_release_date,cover.image_id'
const DETAIL_FIELDS = `${SEARCH_FIELDS},platforms.name`

// ---------------------------------------------------------------------------
// Upstream response shapes (only the fields we use)
// ---------------------------------------------------------------------------

type IgdbGame = {
  id: number
  name?: string
  summary?: string
  /** Unix seconds. */
  first_release_date?: number
  cover?: { image_id?: string } | null
  platforms?: { name?: string }[]
}

type TwitchToken = { access_token?: string; expires_in?: number }

export function coverUrl(
  imageId: string | null | undefined,
  size = 't_cover_big',
): string | undefined {
  return imageId ? `${IMAGE_BASE}/${size}/${imageId}.jpg` : undefined
}

export function yearFromUnixSeconds(seconds: number | null | undefined): number | null {
  if (typeof seconds !== 'number' || !Number.isFinite(seconds)) return null
  const year = new Date(seconds * 1000).getUTCFullYear()
  return year >= 1000 && year <= 9999 ? year : null
}

// ---------------------------------------------------------------------------
// Normalizers (pure)
// ---------------------------------------------------------------------------

export function normalizeGameHit(game: IgdbGame): SearchResult | null {
  const title = game.name?.trim()
  if (!game.id || !title) return null
  return {
    type: 'game',
    source: 'igdb',
    externalId: String(game.id),
    title,
    year: yearFromUnixSeconds(game.first_release_date) ?? undefined,
    coverUrl: coverUrl(game.cover?.image_id),
    blurb: toBlurb(game.summary),
  }
}

export function normalizeGameSearch(games: IgdbGame[]): SearchResult[] {
  return (games ?? []).map(normalizeGameHit).filter((r): r is SearchResult => r !== null)
}

export function normalizeGameDetail(game: IgdbGame): NormalizedMedia {
  const title = game.name?.trim()
  if (!game.id || !title) throw new Error('IGDB game detail is missing an id or name')
  const platforms = (game.platforms ?? [])
    .map((platform) => platform.name?.trim())
    .filter((name): name is string => Boolean(name))
  const details: GameDetails = platforms.length > 0 ? { platforms } : {}
  return {
    type: 'game',
    source: 'igdb',
    external_id: String(game.id),
    title,
    year: yearFromUnixSeconds(game.first_release_date),
    description: game.summary?.trim() || null,
    cover_url: coverUrl(game.cover?.image_id) ?? null,
    details,
  }
}

// ---------------------------------------------------------------------------
// Token cache
// ---------------------------------------------------------------------------

export type IgdbCredentials = { clientId: string; clientSecret: string }

/** Refreshes a minute early so a token can't expire mid-request. */
const EXPIRY_MARGIN_MS = 60_000

export class IgdbClient {
  private token: string | null = null
  private expiresAt = 0

  private readonly credentials: IgdbCredentials
  private readonly now: () => number

  constructor(credentials: IgdbCredentials, now: () => number = Date.now) {
    this.credentials = credentials
    this.now = now
  }

  private async fetchToken(): Promise<string> {
    const { clientId, clientSecret } = this.credentials
    const params = new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: 'client_credentials',
    })
    const token = await fetchJson<TwitchToken>(`${TOKEN_URL}?${params}`, { method: 'POST' })
    if (!token.access_token) throw new Error('Twitch did not return an access token for IGDB')
    this.token = token.access_token
    this.expiresAt = this.now() + Math.max(0, (token.expires_in ?? 0) * 1000 - EXPIRY_MARGIN_MS)
    return this.token
  }

  private async accessToken(): Promise<string> {
    if (this.token && this.now() < this.expiresAt) return this.token
    return this.fetchToken()
  }

  /** Runs an Apicalypse query, retrying once with a fresh token if the cached one is rejected. */
  private async query<T>(body: string): Promise<T> {
    const send = async (token: string) =>
      fetchJson<T>(API, {
        method: 'POST',
        headers: {
          'Client-ID': this.credentials.clientId,
          authorization: `Bearer ${token}`,
          accept: 'application/json',
          'content-type': 'text/plain',
        },
        body,
      })

    try {
      return await send(await this.accessToken())
    } catch (err) {
      if (err instanceof HttpError && (err.status === 401 || err.status === 403)) {
        this.token = null
        return send(await this.fetchToken())
      }
      throw err
    }
  }

  async search(query: string): Promise<SearchResult[]> {
    // Escaping quotes keeps a title like `"Hello"` from breaking the query.
    const escaped = query.replace(/["\\]/g, '')
    const games = await this.query<IgdbGame[]>(
      `search "${escaped}"; fields ${SEARCH_FIELDS}; limit 20;`,
    )
    return normalizeGameSearch(games)
  }

  async details(externalId: string): Promise<NormalizedMedia> {
    const id = Number(externalId)
    if (!Number.isInteger(id)) throw new Error(`Invalid IGDB id: ${externalId}`)
    const games = await this.query<IgdbGame[]>(
      `fields ${DETAIL_FIELDS}; where id = ${id}; limit 1;`,
    )
    const game = games?.[0]
    if (!game) throw new Error(`IGDB has no game with id ${id}`)
    return normalizeGameDetail(game)
  }
}
