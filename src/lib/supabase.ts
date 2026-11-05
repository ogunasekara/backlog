import { createClient, type Session } from '@supabase/supabase-js'
import { env } from '@/lib/env'

/**
 * Where supabase-js keeps the session. This is its default for our URL, spelled out so
 * `readStoredSession` can find it; changing it would sign everyone out.
 */
const AUTH_STORAGE_KEY = `sb-${new URL(env.supabaseUrl).hostname.split('.')[0]}-auth-token`

export const supabase = createClient(env.supabaseUrl, env.supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    flowType: 'pkce',
    storageKey: AUTH_STORAGE_KEY,
  },
})

/**
 * The saved session as-is, even if its access token has expired. supabase-js reports no
 * session when it can't refresh an expired token, and offline it can't, so opening the
 * app offline an hour after last use would otherwise land on the sign-in screen. The
 * token isn't used while offline (queries pause); once online, supabase-js refreshes it.
 */
export function readStoredSession(): Session | null {
  try {
    const raw = localStorage.getItem(AUTH_STORAGE_KEY)
    if (!raw) return null
    const session = JSON.parse(raw) as Partial<Session>
    return session.user && session.refresh_token ? (session as Session) : null
  } catch {
    return null
  }
}
