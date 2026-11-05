import { AuthRetryableFetchError, type Session } from '@supabase/supabase-js'
import { onlineManager, QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { clearCachedLibrary } from '@/lib/query-client'
import { readStoredSession, supabase } from '@/lib/supabase'
import { AuthProvider } from './AuthProvider'
import { useAuth } from './auth-context'

vi.mock('@/lib/supabase', () => ({
  supabase: { auth: { getSession: vi.fn(), onAuthStateChange: vi.fn() } },
  readStoredSession: vi.fn(),
}))
vi.mock('@/lib/query-client', () => ({ clearCachedLibrary: vi.fn() }))

const session = { user: { email: 'me@example.com' }, refresh_token: 'r' } as Session

type Listener = (event: string, session: Session | null) => void
let emit: Listener

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(supabase.auth.onAuthStateChange).mockImplementation((listener) => {
    emit = listener as Listener
    return { data: { subscription: { unsubscribe: vi.fn() } } } as never
  })
})

function Probe() {
  const { session, loading } = useAuth()
  if (loading) return <p>loading</p>
  return <p>{session ? `signed in as ${session.user.email}` : 'signed out'}</p>
}

function renderProvider() {
  const queryClient = new QueryClient()
  render(
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <Probe />
      </AuthProvider>
    </QueryClientProvider>,
  )
  return queryClient
}

describe('AuthProvider', () => {
  it('uses the session supabase-js returns', async () => {
    vi.mocked(supabase.auth.getSession).mockResolvedValue({ data: { session }, error: null })
    renderProvider()
    expect(await screen.findByText('signed in as me@example.com')).toBeInTheDocument()
  })

  it('falls back to the saved session when an expired token cannot be refreshed offline', async () => {
    vi.mocked(supabase.auth.getSession).mockResolvedValue({
      data: { session: null },
      error: new AuthRetryableFetchError('Failed to fetch', 0),
    } as never)
    vi.mocked(readStoredSession).mockReturnValue(session)

    renderProvider()
    expect(await screen.findByText('signed in as me@example.com')).toBeInTheDocument()

    // The initial event carries supabase-js's null; it must not sign the app out.
    act(() => emit('INITIAL_SESSION', null))
    expect(screen.getByText('signed in as me@example.com')).toBeInTheDocument()
  })

  it('signs out when the refresh token is rejected', async () => {
    vi.mocked(supabase.auth.getSession).mockResolvedValue({
      data: { session: null },
      error: new Error('Invalid Refresh Token'),
    } as never)
    vi.mocked(readStoredSession).mockReturnValue(session)

    renderProvider()
    expect(await screen.findByText('signed out')).toBeInTheDocument()
  })

  it('checks the session again on reconnecting', async () => {
    vi.mocked(supabase.auth.getSession).mockResolvedValue({ data: { session }, error: null })
    renderProvider()
    await screen.findByText('signed in as me@example.com')

    act(() => onlineManager.setOnline(false))
    act(() => onlineManager.setOnline(true))
    expect(supabase.auth.getSession).toHaveBeenCalledTimes(2)
  })

  it('clears the saved library on sign-out', async () => {
    vi.mocked(supabase.auth.getSession).mockResolvedValue({ data: { session }, error: null })
    const queryClient = renderProvider()
    await screen.findByText('signed in as me@example.com')

    act(() => emit('SIGNED_OUT', null))

    expect(screen.getByText('signed out')).toBeInTheDocument()
    expect(clearCachedLibrary).toHaveBeenCalledWith(queryClient)
  })
})
