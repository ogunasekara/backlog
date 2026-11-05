import { isAuthRetryableFetchError, type Session } from '@supabase/supabase-js'
import { onlineManager, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState, type ReactNode } from 'react'
import { clearCachedLibrary } from '@/lib/query-client'
import { readStoredSession, supabase } from '@/lib/supabase'
import { AuthContext } from './auth-context'

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient()
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true

    async function load() {
      const { data, error } = await supabase.auth.getSession()
      if (!active) return
      // An expired token that couldn't be refreshed for want of a connection: carry on
      // with the saved session so the cached library opens. A rejected refresh token
      // isn't retryable; supabase-js signs out for that.
      setSession(error && isAuthRetryableFetchError(error) ? readStoredSession() : data.session)
      setLoading(false)
    }

    void load()
    // Back online: refresh the token now rather than at the next auto-refresh tick.
    const unsubscribeOnline = onlineManager.subscribe((online) => {
      if (online) void load()
    })

    const { data } = supabase.auth.onAuthStateChange((event, next) => {
      // `load` handles the first session, including the offline fallback this event
      // would overwrite with null.
      if (event === 'INITIAL_SESSION') return
      // The saved library belongs to whoever was signed in; don't show it to the next.
      if (event === 'SIGNED_OUT') void clearCachedLibrary(queryClient)
      setSession(next)
      setLoading(false)
    })

    return () => {
      active = false
      unsubscribeOnline()
      data.subscription.unsubscribe()
    }
  }, [queryClient])

  return <AuthContext.Provider value={{ session, loading }}>{children}</AuthContext.Provider>
}
