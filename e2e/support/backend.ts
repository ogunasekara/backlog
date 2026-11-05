import { createClient } from '@supabase/supabase-js'
import type { Media } from '../../src/lib/types'
import { localSupabase } from './env'

/** The one test user. Its library is wiped before each test that needs a known state. */
export const E2E_EMAIL = 'e2e-user@example.com'

const env = localSupabase()

/** Service role: bypasses RLS, for setup only. */
export const admin = createClient(env.url, env.serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
})

function check<T>({ data, error }: { data: T; error: { message: string } | null }): T {
  if (error) throw new Error(error.message)
  return data
}

export async function allowListTestUser() {
  check(await admin.from('allowed_emails').upsert({ email: E2E_EMAIL }))
}

async function testUserId(): Promise<string> {
  const { data, error } = await admin.auth.admin.listUsers({ perPage: 1000 })
  if (error) throw new Error(error.message)
  const user = data.users.find(({ email }) => email === E2E_EMAIL)
  if (!user) throw new Error('The e2e user has not signed in yet (run the sign-in project).')
  return user.id
}

/** Deletes the test user's entries and custom items. */
export async function clearLibrary() {
  const userId = await testUserId()
  check(await admin.from('entries').delete().eq('user_id', userId))
  check(await admin.from('media').delete().eq('created_by', userId))
}

let counter = 0

/** A catalog row as the `details` function would upsert it. */
export async function upsertCatalogMedia(media: Partial<Media> & Pick<Media, 'type' | 'title'>) {
  counter += 1
  const row = {
    source: 'tmdb' as const,
    external_id: `e2e-${media.type}-${media.title.toLowerCase().replace(/\W+/g, '-')}`,
    year: 2020,
    description: null,
    cover_url: null,
    details: {},
    ...media,
  }
  return check(
    await admin.from('media').upsert(row, { onConflict: 'source,external_id' }).select().single(),
  ) as Media
}

export async function addEntry(
  media: Media,
  entry: { status?: string; backlog_position?: string | null } = {},
) {
  const status = entry.status ?? 'backlog'
  check(
    await admin.from('entries').insert({
      user_id: await testUserId(),
      media_id: media.id,
      status,
      backlog_position: entry.backlog_position ?? (status === 'backlog' ? `a${counter}` : null),
    }),
  )
}

type InboxMessage = { ID: string; Snippet: string; Created: string }

/** The newest six-digit code sent to `email` after `since`, from Mailpit. */
export async function readSignInCode(email: string, since: Date): Promise<string> {
  const deadline = Date.now() + 15_000
  while (Date.now() < deadline) {
    const query = encodeURIComponent(`to:"${email}"`)
    const response = await fetch(`${env.inboxUrl}/api/v1/search?query=${query}&limit=5`)
    const { messages } = (await response.json()) as { messages: InboxMessage[] }
    const fresh = messages.find((message) => new Date(message.Created) >= since)
    const code = fresh?.Snippet.match(/\b(\d{6})\b/)?.[1]
    if (code) return code
    await new Promise((resolve) => setTimeout(resolve, 500))
  }
  throw new Error(`No sign-in code arrived for ${email}`)
}
