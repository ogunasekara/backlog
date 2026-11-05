import type { Page, Route } from '@playwright/test'
import type { Media, SearchResult } from '../../src/lib/types'
import { upsertCatalogMedia } from './backend'

const cors = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': '*',
  'access-control-allow-methods': 'POST, OPTIONS',
}

function json(route: Route, body: unknown) {
  if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors })
  return route.fulfill({ status: 200, headers: cors, json: body })
}

/**
 * Stands in for the `search` and `details` edge functions, which call TMDB, IGDB and
 * Google Books with real keys. `details` upserts the catalog row like the real one.
 */
export async function mockMetadataFunctions(page: Page, results: SearchResult[]) {
  await page.route('**/functions/v1/search', (route) => json(route, { results }))
  await page.route('**/functions/v1/details', async (route) => {
    if (route.request().method() === 'OPTIONS') return json(route, null)
    const { externalId, type } = route.request().postDataJSON() as {
      externalId: string
      type: Media['type']
    }
    const hit = results.find((result) => result.externalId === externalId)
    const media = await upsertCatalogMedia({
      type,
      title: hit?.title ?? externalId,
      external_id: externalId,
      year: hit?.year ?? null,
    })
    return json(route, { media })
  })
}
