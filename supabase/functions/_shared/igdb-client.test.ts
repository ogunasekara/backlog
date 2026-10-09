import { afterEach, describe, expect, it, vi } from 'vitest'
import { IgdbClient } from './igdb.ts'

const credentials = { clientId: 'client-id', clientSecret: 'client-secret' }

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

const tokenResponse = (token: string, expiresIn = 3600) =>
  jsonResponse({ access_token: token, expires_in: expiresIn, token_type: 'bearer' })

const game = { id: 1942, name: 'The Witcher 2' }

function stubFetch(...responses: (Response | (() => Response))[]) {
  const fetchMock = vi.fn<typeof fetch>()
  for (const response of responses) {
    fetchMock.mockImplementationOnce(async () =>
      typeof response === 'function' ? response() : response.clone(),
    )
  }
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

function callsTo(fetchMock: ReturnType<typeof stubFetch>, host: string) {
  return fetchMock.mock.calls.filter(([url]) => String(url).includes(host))
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

describe('IgdbClient', () => {
  it('fetches a token once and reuses it across calls', async () => {
    const fetchMock = stubFetch(tokenResponse('tok-1'), jsonResponse([game]), jsonResponse([game]))
    const client = new IgdbClient(credentials)

    await client.search('witcher')
    await client.search('witcher again')

    expect(callsTo(fetchMock, 'id.twitch.tv')).toHaveLength(1)
    expect(callsTo(fetchMock, 'api.igdb.com')).toHaveLength(2)
  })

  it('sends the client id and bearer token with an Apicalypse body', async () => {
    const fetchMock = stubFetch(tokenResponse('tok-1'), jsonResponse([game]))
    await new IgdbClient(credentials).search('witcher')

    const [url, init] = callsTo(fetchMock, 'api.igdb.com')[0]
    expect(url).toBe('https://api.igdb.com/v4/games')
    const headers = (init as RequestInit).headers as Record<string, string>
    expect(headers['Client-ID']).toBe('client-id')
    expect(headers.authorization).toBe('Bearer tok-1')
    expect((init as RequestInit).body).toContain('search "witcher";')
  })

  it('refreshes the token once it has expired', async () => {
    let now = 0
    const fetchMock = stubFetch(
      tokenResponse('tok-1', 3600),
      jsonResponse([game]),
      tokenResponse('tok-2', 3600),
      jsonResponse([game]),
    )
    const client = new IgdbClient(credentials, () => now)

    await client.search('a')
    now = 3600 * 1000 // past the token's lifetime
    await client.search('b')

    expect(callsTo(fetchMock, 'id.twitch.tv')).toHaveLength(2)
    const headers = callsTo(fetchMock, 'api.igdb.com')[1][1] as RequestInit
    expect((headers.headers as Record<string, string>).authorization).toBe('Bearer tok-2')
  })

  it('retries once with a fresh token when IGDB rejects the cached one', async () => {
    const fetchMock = stubFetch(
      tokenResponse('stale'),
      jsonResponse({ message: 'Unauthorized' }, 401),
      tokenResponse('fresh'),
      jsonResponse([game]),
    )
    const results = await new IgdbClient(credentials).search('witcher')

    expect(results).toHaveLength(1)
    expect(callsTo(fetchMock, 'id.twitch.tv')).toHaveLength(2)
    const retry = callsTo(fetchMock, 'api.igdb.com')[1][1] as RequestInit
    expect((retry.headers as Record<string, string>).authorization).toBe('Bearer fresh')
  })

  it('gives up after one retry rather than looping', async () => {
    const fetchMock = stubFetch(
      tokenResponse('stale'),
      jsonResponse({ message: 'Unauthorized' }, 401),
      tokenResponse('fresh'),
      jsonResponse({ message: 'Unauthorized' }, 401),
    )
    await expect(new IgdbClient(credentials).search('witcher')).rejects.toThrow(/401/)
    expect(callsTo(fetchMock, 'api.igdb.com')).toHaveLength(2)
  })

  it('throws when Twitch returns no token', async () => {
    stubFetch(jsonResponse({ message: 'invalid client' }))
    await expect(new IgdbClient(credentials).search('witcher')).rejects.toThrow(
      /did not return an access token/,
    )
  })

  it('strips quotes from the query so the Apicalypse body stays valid', async () => {
    const fetchMock = stubFetch(tokenResponse('tok'), jsonResponse([game]))
    await new IgdbClient(credentials).search('say "hello" \\ now')
    expect((callsTo(fetchMock, 'api.igdb.com')[0][1] as RequestInit).body).toBe(
      'search "say hello  now"; fields name,summary,first_release_date,cover.image_id; limit 20;',
    )
  })

  it('looks up details by numeric id and rejects a non-numeric one', async () => {
    const fetchMock = stubFetch(tokenResponse('tok'), jsonResponse([game]))
    const client = new IgdbClient(credentials)

    const media = await client.details('1942')
    expect(media.external_id).toBe('1942')
    expect((callsTo(fetchMock, 'api.igdb.com')[0][1] as RequestInit).body).toContain(
      'where id = 1942;',
    )

    await expect(client.details('not-a-number')).rejects.toThrow(/Invalid IGDB id/)
  })

  it('throws when IGDB returns no game for the id', async () => {
    stubFetch(tokenResponse('tok'), jsonResponse([]))
    await expect(new IgdbClient(credentials).details('404')).rejects.toThrow(/no game with id 404/)
  })
})
