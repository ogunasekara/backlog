/**
 * POST /details  { source: 'tmdb'|'igdb'|'google_books', externalId: string, type?: 'movie'|'tv' }
 * Fetches the full upstream record, normalizes it, upserts the `media` row with the
 * service role, and returns that row. Called when adding an item, on "Refresh
 * metadata", and when opening an in-progress TV show.
 */
import { createClient } from 'npm:@supabase/supabase-js@2.58.0'
import { bookDetails } from '../_shared/google-books.ts'
import { errorResponse, json, preflight } from '../_shared/http-response.ts'
import { IgdbClient } from '../_shared/igdb.ts'
import { movieDetails, tvDetails } from '../_shared/tmdb.ts'
import type { CatalogSource, MediaType, NormalizedMedia } from '../_shared/types.ts'

let igdb: IgdbClient | null = null

function igdbClient(): IgdbClient {
  const clientId = Deno.env.get('TWITCH_CLIENT_ID')
  const clientSecret = Deno.env.get('TWITCH_CLIENT_SECRET')
  if (!clientId || !clientSecret)
    throw new Error('IGDB is not configured (TWITCH_CLIENT_ID/SECRET)')
  igdb ??= new IgdbClient({ clientId, clientSecret })
  return igdb
}

function requireTmdbKey(): string {
  const key = Deno.env.get('TMDB_KEY')
  if (!key) throw new Error('TMDB is not configured (TMDB_KEY)')
  return key
}

function fetchNormalized(
  source: CatalogSource,
  externalId: string,
  type: MediaType | undefined,
): Promise<NormalizedMedia> {
  switch (source) {
    case 'tmdb':
      // TMDB uses separate endpoints for movies and shows, so the type is required here.
      if (type === 'movie') return movieDetails(requireTmdbKey(), externalId)
      if (type === 'tv') return tvDetails(requireTmdbKey(), externalId)
      throw new Error("`type` must be 'movie' or 'tv' when source is 'tmdb'")
    case 'igdb':
      return igdbClient().details(externalId)
    case 'google_books':
      return bookDetails(Deno.env.get('GOOGLE_BOOKS_KEY'), externalId)
  }
}

const SOURCES: CatalogSource[] = ['tmdb', 'igdb', 'google_books']

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return preflight()
  if (request.method !== 'POST') return errorResponse('Use POST', 405)

  let body: { source?: unknown; externalId?: unknown; type?: unknown }
  try {
    body = await request.json()
  } catch {
    return errorResponse('Body must be JSON', 400)
  }

  const source = body.source as CatalogSource
  if (!SOURCES.includes(source)) {
    return errorResponse(`\`source\` must be one of ${SOURCES.join(', ')}`, 400)
  }
  const externalId = typeof body.externalId === 'string' ? body.externalId.trim() : ''
  if (!externalId) return errorResponse('`externalId` is required', 400)
  const type = typeof body.type === 'string' ? (body.type as MediaType) : undefined
  // TMDB splits movies and shows across endpoints, so the type is part of the request.
  if (source === 'tmdb' && type !== 'movie' && type !== 'tv') {
    return errorResponse("`type` must be 'movie' or 'tv' when source is 'tmdb'", 400)
  }

  let normalized: NormalizedMedia
  try {
    normalized = await fetchNormalized(source, externalId, type)
  } catch (err) {
    return errorResponse(err instanceof Error ? err.message : 'Lookup failed', 502)
  }

  const admin = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    { auth: { persistSession: false } },
  )

  const { data, error } = await admin
    .from('media')
    .upsert(
      { ...normalized, fetched_at: new Date().toISOString() },
      { onConflict: 'source,external_id' },
    )
    .select()
    .single()

  if (error) return errorResponse(`Could not save metadata: ${error.message}`, 500)
  return json({ media: data })
})
