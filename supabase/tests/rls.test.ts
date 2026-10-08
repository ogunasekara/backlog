import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest'

const url = inject('supabaseUrl')
const anonKey = inject('anonKey')
const serviceRoleKey = inject('serviceRoleKey')

const noSession = { auth: { persistSession: false, autoRefreshToken: false } }
const admin = createClient(url, serviceRoleKey, noSession)
const anon = createClient(url, anonKey, noSession)

const run = randomUUID().slice(0, 8)
const password = `pw-${randomUUID()}`
const emailA = `rls-a-${run}@example.com`
const emailB = `rls-b-${run}@example.com`

type User = { id: string; client: SupabaseClient }
let userA: User
let userB: User
let catalogMediaId: string
let customMediaA: string
let entryA: string

async function createUser(email: string): Promise<User> {
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  })
  if (error) throw error
  const client = createClient(url, anonKey, noSession)
  const signIn = await client.auth.signInWithPassword({ email, password })
  if (signIn.error) throw signIn.error
  return { id: data.user.id, client }
}

beforeAll(async () => {
  const allow = await admin.from('allowed_emails').insert([{ email: emailA }, { email: emailB }])
  if (allow.error) throw allow.error

  userA = await createUser(emailA)
  userB = await createUser(emailB)

  const catalog = await admin
    .from('media')
    .insert({ type: 'movie', source: 'tmdb', external_id: `test-${run}`, title: 'Catalog Movie' })
    .select('id')
    .single()
  if (catalog.error) throw catalog.error
  catalogMediaId = catalog.data.id

  const custom = await userA.client
    .from('media')
    .insert({ type: 'game', source: 'custom', title: 'A Custom Game', created_by: userA.id })
    .select('id')
    .single()
  if (custom.error) throw custom.error
  customMediaA = custom.data.id

  const entry = await userA.client
    .from('entries')
    .insert({ media_id: customMediaA, status: 'backlog', backlog_position: 'a0' })
    .select('id')
    .single()
  if (entry.error) throw entry.error
  entryA = entry.data.id
})

afterAll(async () => {
  for (const user of [userA, userB]) if (user) await admin.auth.admin.deleteUser(user.id)
  await admin.from('media').delete().eq('id', catalogMediaId)
  await admin.from('allowed_emails').delete().in('email', [emailA, emailB])
})

describe('allow-list hook', () => {
  it('rejects sign-up for an email that is not allow-listed', async () => {
    const { error } = await anon.auth.signInWithOtp({ email: `stranger-${run}@example.com` })
    expect(error?.message).toMatch(/not allowed/i)
  })

  it('rejects password sign-up for an email that is not allow-listed', async () => {
    const { error } = await anon.auth.signUp({ email: `stranger2-${run}@example.com`, password })
    expect(error?.message).toMatch(/not allowed/i)
  })

  it('accepts sign-up for an allow-listed email (case-insensitive)', async () => {
    const email = `allowed-${run}@example.com`
    await admin.from('allowed_emails').insert({ email })
    const { error } = await anon.auth.signInWithOtp({ email: email.toUpperCase() })
    expect(error).toBeNull()

    const { data } = await admin.auth.admin.listUsers()
    const created = data.users.find((u) => u.email === email)
    expect(created).toBeDefined()
    await admin.auth.admin.deleteUser(created!.id)
    await admin.from('allowed_emails').delete().eq('email', email)
  })
})

describe('anonymous access', () => {
  it.each(['media', 'entries', 'allowed_emails'])('cannot read %s', async (table) => {
    const { data, error } = await anon.from(table).select('*')
    // Either a permission error or an empty result is acceptable; data must not leak.
    expect(error !== null || data?.length === 0).toBe(true)
  })
})

describe('allowed_emails', () => {
  it('is not readable by signed-in users', async () => {
    const { data, error } = await userA.client.from('allowed_emails').select('*')
    expect(error !== null || data?.length === 0).toBe(true)
  })

  it('is not writable by signed-in users', async () => {
    const { error } = await userA.client
      .from('allowed_emails')
      .insert({ email: `x-${run}@example.com` })
    expect(error).not.toBeNull()
  })
})

describe('entries', () => {
  it('owner can read their entry', async () => {
    const { data } = await userA.client.from('entries').select('id').eq('id', entryA)
    expect(data).toHaveLength(1)
  })

  it('another user cannot read it', async () => {
    const { data } = await userB.client.from('entries').select('id').eq('id', entryA)
    expect(data).toHaveLength(0)
  })

  it('another user cannot update it', async () => {
    const { data } = await userB.client
      .from('entries')
      .update({ notes: 'hacked' })
      .eq('id', entryA)
      .select('id')
    expect(data ?? []).toHaveLength(0)
    const check = await admin.from('entries').select('notes').eq('id', entryA).single()
    expect(check.data?.notes).toBe('')
  })

  it('another user cannot delete it', async () => {
    await userB.client.from('entries').delete().eq('id', entryA)
    const check = await admin.from('entries').select('id').eq('id', entryA)
    expect(check.data).toHaveLength(1)
  })

  it('a user cannot insert an entry for someone else', async () => {
    const { error } = await userB.client
      .from('entries')
      .insert({ user_id: userA.id, media_id: catalogMediaId, status: 'completed' })
    expect(error).not.toBeNull()
  })

  it("a user cannot point an entry at someone else's custom media", async () => {
    const { error } = await userB.client
      .from('entries')
      .insert({ media_id: customMediaA, status: 'completed' })
    expect(error).not.toBeNull()
  })

  it('a user cannot move their entry to another user', async () => {
    const { error } = await userA.client
      .from('entries')
      .update({ user_id: userB.id })
      .eq('id', entryA)
    expect(error).not.toBeNull()
  })

  it('allows only one entry per user per media item', async () => {
    const first = await userB.client
      .from('entries')
      .insert({ media_id: catalogMediaId, status: 'completed' })
    expect(first.error).toBeNull()
    const second = await userB.client
      .from('entries')
      .insert({ media_id: catalogMediaId, status: 'dropped' })
    expect(second.error?.code).toBe('23505')
  })
})

describe('backlog_position check constraint', () => {
  it('rejects a backlog entry without a position', async () => {
    const { error } = await userA.client
      .from('entries')
      .insert({ media_id: catalogMediaId, status: 'backlog', backlog_position: null })
    expect(error?.code).toBe('23514')
  })

  it('rejects a non-backlog entry with a position', async () => {
    const { error } = await userA.client
      .from('entries')
      .insert({ media_id: catalogMediaId, status: 'completed', backlog_position: 'a0' })
    expect(error?.code).toBe('23514')
  })

  it('accepts leaving the backlog when the position is cleared', async () => {
    const { error } = await userA.client
      .from('entries')
      .update({ status: 'in_progress', backlog_position: null })
      .eq('id', entryA)
    expect(error).toBeNull()
  })
})

describe('media', () => {
  it('catalog items are visible to every signed-in user', async () => {
    for (const user of [userA, userB]) {
      const { data } = await user.client.from('media').select('id').eq('id', catalogMediaId)
      expect(data).toHaveLength(1)
    }
  })

  it('custom items are visible only to their creator', async () => {
    const own = await userA.client.from('media').select('id').eq('id', customMediaA)
    expect(own.data).toHaveLength(1)
    const other = await userB.client.from('media').select('id').eq('id', customMediaA)
    expect(other.data).toHaveLength(0)
  })

  it('signed-in users cannot insert catalog items', async () => {
    const { error } = await userA.client
      .from('media')
      .insert({ type: 'movie', source: 'tmdb', external_id: `fake-${run}`, title: 'Fake' })
    expect(error).not.toBeNull()
  })

  it('signed-in users cannot create custom items owned by someone else', async () => {
    const { error } = await userB.client
      .from('media')
      .insert({ type: 'book', source: 'custom', title: 'Spoof', created_by: userA.id })
    expect(error).not.toBeNull()
  })

  it('signed-in users cannot modify catalog items', async () => {
    await userA.client.from('media').update({ title: 'Changed' }).eq('id', catalogMediaId)
    const check = await admin.from('media').select('title').eq('id', catalogMediaId).single()
    expect(check.data?.title).toBe('Catalog Movie')
  })

  it("another user cannot modify or delete someone's custom item", async () => {
    await userB.client.from('media').update({ title: 'Changed' }).eq('id', customMediaA)
    await userB.client.from('media').delete().eq('id', customMediaA)
    const check = await admin.from('media').select('title').eq('id', customMediaA).single()
    expect(check.data?.title).toBe('A Custom Game')
  })
})
