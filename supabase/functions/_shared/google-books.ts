/**
 * Google Books client and normalizers.
 * Docs: https://developers.google.com/books/docs/v1/using
 */
import { fetchJson, toBlurb, yearFrom } from './http.ts'
import type { BookDetails, NormalizedMedia, SearchResult } from './types.ts'

const API = 'https://www.googleapis.com/books/v1/volumes'

// ---------------------------------------------------------------------------
// Upstream response shapes (only the fields we use)
// ---------------------------------------------------------------------------

type VolumeInfo = {
  title?: string
  subtitle?: string
  authors?: string[]
  publishedDate?: string
  description?: string
  pageCount?: number
  imageLinks?: { thumbnail?: string; smallThumbnail?: string }
}

type Volume = { id?: string; volumeInfo?: VolumeInfo }

type VolumeList = { items?: Volume[] }

/** Google serves thumbnails over http in some responses, which browsers block on an https page. */
export function coverUrl(links: VolumeInfo['imageLinks']): string | undefined {
  const url = links?.thumbnail ?? links?.smallThumbnail
  return url ? url.replace(/^http:\/\//, 'https://') : undefined
}

export function fullTitle(info: VolumeInfo): string | undefined {
  const title = info.title?.trim()
  if (!title) return undefined
  const subtitle = info.subtitle?.trim()
  return subtitle ? `${title}: ${subtitle}` : title
}

// ---------------------------------------------------------------------------
// Normalizers (pure)
// ---------------------------------------------------------------------------

export function normalizeVolumeHit(volume: Volume): SearchResult | null {
  const info = volume.volumeInfo ?? {}
  const title = fullTitle(info)
  if (!volume.id || !title) return null
  const authors = info.authors?.filter(Boolean)
  return {
    type: 'book',
    source: 'google_books',
    externalId: volume.id,
    title,
    year: yearFrom(info.publishedDate) ?? undefined,
    coverUrl: coverUrl(info.imageLinks),
    // Authors are more useful than the description at a glance, so they lead the blurb.
    blurb: authors?.length
      ? toBlurb(`${authors.join(', ')} — ${info.description ?? ''}`)
      : toBlurb(info.description),
  }
}

export function normalizeVolumeSearch(list: VolumeList): SearchResult[] {
  return (list.items ?? []).map(normalizeVolumeHit).filter((r): r is SearchResult => r !== null)
}

export function normalizeVolumeDetail(volume: Volume): NormalizedMedia {
  const info = volume.volumeInfo ?? {}
  const title = fullTitle(info)
  if (!volume.id || !title) throw new Error('Google Books volume is missing an id or title')
  const authors = info.authors?.filter(Boolean)
  const details: BookDetails = {}
  if (info.pageCount && info.pageCount > 0) details.page_count = info.pageCount
  if (authors?.length) details.authors = authors
  return {
    type: 'book',
    source: 'google_books',
    external_id: volume.id,
    title,
    year: yearFrom(info.publishedDate),
    description: info.description?.trim() || null,
    cover_url: coverUrl(info.imageLinks) ?? null,
    details,
  }
}

// ---------------------------------------------------------------------------
// Client
// ---------------------------------------------------------------------------

/**
 * The API accepts unauthenticated calls, but the keyless daily quota is zero, so
 * requests without a key come back 429. Treat GOOGLE_BOOKS_KEY as required.
 */
function withKey(url: string, key: string | undefined): string {
  return key ? `${url}${url.includes('?') ? '&' : '?'}key=${encodeURIComponent(key)}` : url
}

export async function searchBooks(key: string | undefined, query: string): Promise<SearchResult[]> {
  const url = withKey(`${API}?q=${encodeURIComponent(query)}&maxResults=20&printType=books`, key)
  return normalizeVolumeSearch(
    await fetchJson<VolumeList>(url, { headers: { accept: 'application/json' } }),
  )
}

export async function bookDetails(
  key: string | undefined,
  externalId: string,
): Promise<NormalizedMedia> {
  const url = withKey(`${API}/${encodeURIComponent(externalId)}`, key)
  return normalizeVolumeDetail(
    await fetchJson<Volume>(url, { headers: { accept: 'application/json' } }),
  )
}
