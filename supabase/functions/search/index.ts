/**
 * POST /search  { type: 'movie'|'tv'|'book'|'game'|'all', query: string }
 * Returns normalized results from TMDB, IGDB and Google Books. `all` fans out in
 * parallel, so one slow or failing source never blocks the others.
 * Requires a valid Supabase JWT (the platform verifies it before this runs).
 */
import { searchBooks } from '../_shared/google-books.ts'
import { errorResponse, json, preflight } from '../_shared/http-response.ts'
import { IgdbClient } from '../_shared/igdb.ts'
import { runSearchTasks, type SearchTask } from '../_shared/search.ts'
import { searchMovies, searchTv } from '../_shared/tmdb.ts'
import type { SearchScope } from '../_shared/types.ts'

const SCOPES: SearchScope[] = ['movie', 'tv', 'book', 'game', 'all']

// Held across invocations so the IGDB token is reused while the instance is warm.
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

function tasksFor(scope: SearchScope, query: string): SearchTask[] {
  const movie: SearchTask = {
    type: 'movie',
    source: 'tmdb',
    run: () => searchMovies(requireTmdbKey(), query),
  }
  const tv: SearchTask = {
    type: 'tv',
    source: 'tmdb',
    run: () => searchTv(requireTmdbKey(), query),
  }
  const book: SearchTask = {
    type: 'book',
    source: 'google_books',
    run: () => searchBooks(Deno.env.get('GOOGLE_BOOKS_KEY'), query),
  }
  const game: SearchTask = { type: 'game', source: 'igdb', run: () => igdbClient().search(query) }

  switch (scope) {
    case 'movie':
      return [movie]
    case 'tv':
      return [tv]
    case 'book':
      return [book]
    case 'game':
      return [game]
    case 'all':
      return [movie, tv, book, game]
  }
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return preflight()
  if (request.method !== 'POST') return errorResponse('Use POST', 405)

  let body: { type?: unknown; query?: unknown }
  try {
    body = await request.json()
  } catch {
    return errorResponse('Body must be JSON', 400)
  }

  const query = typeof body.query === 'string' ? body.query.trim() : ''
  if (!query) return errorResponse('`query` is required', 400)

  const scope = (body.type ?? 'all') as SearchScope
  if (!SCOPES.includes(scope)) {
    return errorResponse(`\`type\` must be one of ${SCOPES.join(', ')}`, 400)
  }

  try {
    return json(await runSearchTasks(tasksFor(scope, query)))
  } catch (err) {
    // A configuration problem (a missing key) rather than an upstream failure.
    return errorResponse(err instanceof Error ? err.message : 'Search failed', 500)
  }
})
