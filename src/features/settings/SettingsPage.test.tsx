import { onlineManager } from '@tanstack/react-query'
import { act, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { signOut } from '@/features/auth/api'
import * as entriesApi from '@/lib/api/entries'
import { saveExport } from '@/lib/export'
import { makeEntry } from '@/test/fixtures'
import { renderWithProviders } from '@/test/render'
import { SettingsPage } from './SettingsPage'

vi.mock('@/lib/api/entries', () => ({ listEntries: vi.fn() }))
vi.mock('@/features/auth/api', () => ({ signOut: vi.fn() }))
vi.mock('@/features/auth/auth-context', () => ({
  useAuth: () => ({ session: { user: { email: 'me@example.com' } }, loading: false }),
}))
vi.mock('@/lib/export', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/export')>()),
  saveExport: vi.fn(),
}))

const toasts = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }))
vi.mock('sonner', () => ({ toast: toasts }))

const alien = makeEntry({ id: 'alien' }, { id: 'm-alien', title: 'Alien' })
const dune = makeEntry({ id: 'dune' }, { id: 'm-dune', title: 'Dune', type: 'book' })

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(entriesApi.listEntries).mockResolvedValue([alien, dune])
  vi.mocked(saveExport).mockResolvedValue()
  vi.mocked(signOut).mockResolvedValue()
})

describe('SettingsPage', () => {
  it('shows who is signed in and the app version', () => {
    renderWithProviders(<SettingsPage />)
    expect(screen.getByText('me@example.com')).toBeInTheDocument()
    expect(screen.getByText(/^Version/)).toHaveTextContent(__APP_VERSION__)
    expect(screen.getByText(/uses the TMDB API/)).toBeInTheDocument()
  })

  it('exports the library fresh from the server', async () => {
    const user = userEvent.setup()
    renderWithProviders(<SettingsPage />)

    await user.click(screen.getByRole('button', { name: 'Export as JSON' }))

    await waitFor(() => expect(saveExport).toHaveBeenCalledTimes(1))
    const data = vi.mocked(saveExport).mock.calls[0]![0]
    expect(data.entries.map((entry) => entry.id)).toEqual(['alien', 'dune'])
    expect(data.media.map((item) => item.title)).toEqual(['Alien', 'Dune'])
    expect(toasts.success).toHaveBeenCalledWith('Exported 2 items')
  })

  it('reports a failed export', async () => {
    vi.mocked(entriesApi.listEntries).mockRejectedValue(new Error('Network down'))
    const user = userEvent.setup()
    renderWithProviders(<SettingsPage />)

    await user.click(screen.getByRole('button', { name: 'Export as JSON' }))

    await waitFor(() => expect(toasts.error).toHaveBeenCalledWith('Network down'))
    expect(saveExport).not.toHaveBeenCalled()
  })

  it('signs out', async () => {
    const user = userEvent.setup()
    renderWithProviders(<SettingsPage />)
    await user.click(screen.getByRole('button', { name: 'Sign out' }))
    expect(signOut).toHaveBeenCalled()
  })

  it('needs a connection to export or sign out', () => {
    renderWithProviders(<SettingsPage />)
    act(() => onlineManager.setOnline(false))
    expect(screen.getByRole('button', { name: 'Export as JSON' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Sign out' })).toBeDisabled()
  })
})
