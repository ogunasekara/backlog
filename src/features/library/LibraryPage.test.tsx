import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as entriesApi from '@/lib/api/entries'
import { makeEntry } from '@/test/fixtures'
import { renderWithProviders } from '@/test/render'
import { LibraryPage } from './LibraryPage'

vi.mock('@/lib/api/entries', () => ({ listEntries: vi.fn() }))

const inception = makeEntry(
  { id: 'inception', status: 'completed', rating: 9, created_at: '2026-10-01T00:00:00Z' },
  { type: 'movie', title: 'Inception' },
)
const hobbit = makeEntry(
  { id: 'hobbit', status: 'in_progress', progress_percent: 40, created_at: '2026-10-03T00:00:00Z' },
  { type: 'book', title: 'The Hobbit', source: 'google_books' },
)
const alien = makeEntry(
  { id: 'alien', status: 'backlog', created_at: '2026-10-02T00:00:00Z' },
  { type: 'movie', title: 'Alien' },
)

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(entriesApi.listEntries).mockResolvedValue([inception, hobbit, alien])
})

function rowTitles() {
  return within(screen.getByRole('list'))
    .getAllByRole('link')
    .map((link) => link.querySelector('p')?.textContent)
}

describe('LibraryPage', () => {
  it('lists everything, newest first, with per-type status labels', async () => {
    renderWithProviders(<LibraryPage />, { route: '/library' })

    expect(await screen.findByText('The Hobbit')).toBeInTheDocument()
    expect(rowTitles()).toEqual(['The Hobbit', 'Alien', 'Inception'])
    expect(screen.getByText('Reading')).toBeInTheDocument()
    expect(screen.getByText('40%', { exact: false })).toBeInTheDocument()
    expect(screen.getByRole('img', { name: '4.5 stars' })).toBeInTheDocument()
  })

  it('links each row to its entry', async () => {
    renderWithProviders(<LibraryPage />, { route: '/library' })
    const link = await screen.findByRole('link', { name: /Inception/ })
    expect(link).toHaveAttribute('href', '/library/inception')
  })

  it('filters by the type tab and scopes the add link to it', async () => {
    const user = userEvent.setup()
    renderWithProviders(<LibraryPage />, { route: '/library' })
    await screen.findByText('Inception')

    await user.click(screen.getByRole('tab', { name: 'Movies' }))

    expect(rowTitles()).toEqual(['Alien', 'Inception'])
    expect(screen.getByTestId('location')).toHaveTextContent('/library?type=movie')
    expect(screen.getByRole('link', { name: 'Add' })).toHaveAttribute('href', '/search?type=movie')
  })

  it('filters by status and sorts by title from the URL', async () => {
    renderWithProviders(<LibraryPage />, { route: '/library?type=movie&sort=title' })
    await screen.findByText('Inception')
    expect(rowTitles()).toEqual(['Alien', 'Inception'])

    const user = userEvent.setup()
    await user.click(screen.getByLabelText('Status'))
    await user.click(await screen.findByRole('option', { name: 'Completed' }))

    expect(rowTitles()).toEqual(['Inception'])
    expect(screen.getByTestId('location')).toHaveTextContent('status=completed')
  })

  it('labels in-progress by type within a type tab', async () => {
    const user = userEvent.setup()
    renderWithProviders(<LibraryPage />, { route: '/library?type=game' })
    await screen.findByText('Nothing here matches these filters.')

    await user.click(screen.getByLabelText('Status'))
    expect(await screen.findByRole('option', { name: 'Playing' })).toBeInTheDocument()
  })

  it('shows the empty state when nothing has been added', async () => {
    vi.mocked(entriesApi.listEntries).mockResolvedValue([])
    renderWithProviders(<LibraryPage />, { route: '/library' })
    expect(await screen.findByText('Your library is empty.')).toBeInTheDocument()
  })
})
