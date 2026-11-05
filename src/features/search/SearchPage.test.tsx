import { onlineManager } from '@tanstack/react-query'
import { act, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DuplicateEntryError } from '@/lib/api/entries'
import * as entriesApi from '@/lib/api/entries'
import * as searchApi from '@/lib/api/search'
import { renderWithProviders } from '@/test/render'
import type { Media, SearchResult } from '@/lib/types'
import { SearchPage } from './SearchPage'

vi.mock('@/lib/api/search')
// The factory declares DuplicateEntryError rather than importing the real module,
// which would pull in the Supabase client (and its env requirements) into the test.
// The component and the test both see this same class, so `instanceof` still holds.
vi.mock('@/lib/api/entries', () => ({
  DuplicateEntryError: class DuplicateEntryError extends Error {
    entryId: string | null
    constructor(entryId: string | null) {
      super('This is already in your library.')
      this.name = 'DuplicateEntryError'
      this.entryId = entryId
    }
  },
  addEntry: vi.fn(),
  createCustomMedia: vi.fn(),
  listEntries: vi.fn(),
  findEntryId: vi.fn(),
  nextBacklogPosition: vi.fn(),
}))

const toasts = vi.hoisted(() => ({
  success: vi.fn(),
  error: vi.fn(),
  info: vi.fn(),
}))
vi.mock('sonner', () => ({ toast: toasts }))

const inception: SearchResult = {
  type: 'movie',
  source: 'tmdb',
  externalId: '27205',
  title: 'Inception',
  year: 2010,
  coverUrl: 'https://image.tmdb.org/t/p/w500/poster.jpg',
  blurb: 'A thief who steals corporate secrets.',
}

const hobbit: SearchResult = {
  type: 'book',
  source: 'google_books',
  externalId: 'yl4dILkcqm4C',
  title: 'The Hobbit',
}

const media = { id: 'media-1', title: 'Inception' } as Media

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(searchApi.fetchMediaDetails).mockResolvedValue(media)
  vi.mocked(entriesApi.addEntry).mockResolvedValue({ id: 'entry-1' } as never)
})

async function searchFor(term: string) {
  const user = userEvent.setup()
  renderWithProviders(<SearchPage />)
  await user.type(screen.getByLabelText('Search'), term)
  await user.click(screen.getByRole('button', { name: 'Search' }))
  return user
}

describe('SearchPage', () => {
  it('searches across all types by default and lists the results', async () => {
    vi.mocked(searchApi.searchMedia).mockResolvedValue({ results: [inception, hobbit] })
    await searchFor('inception')

    expect(searchApi.searchMedia).toHaveBeenCalledWith('all', 'inception')
    expect(await screen.findByText('Inception')).toBeInTheDocument()
    expect(screen.getByText('The Hobbit')).toBeInTheDocument()
    expect(screen.getByText('2010')).toBeInTheDocument()
  })

  it('turns off searching and adding while offline', async () => {
    vi.mocked(searchApi.searchMedia).mockResolvedValue({ results: [inception] })
    await searchFor('inception')
    await screen.findByText('Inception')

    act(() => onlineManager.setOnline(false))

    expect(screen.getByText('Searching and adding need a connection.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Search' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Custom item' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Add' })).toBeDisabled()
  })

  it('scopes the search to the chosen type', async () => {
    vi.mocked(searchApi.searchMedia).mockResolvedValue({ results: [] })
    const user = await searchFor('zelda')

    await user.click(screen.getByLabelText('Type'))
    await user.click(await screen.findByRole('option', { name: 'Games' }))
    await user.click(screen.getByRole('button', { name: 'Search' }))

    await waitFor(() => expect(searchApi.searchMedia).toHaveBeenCalledWith('game', 'zelda'))
  })

  it('starts scoped from the URL so the library tabs can link in', async () => {
    vi.mocked(searchApi.searchMedia).mockResolvedValue({ results: [] })
    const user = userEvent.setup()
    renderWithProviders(<SearchPage />, { route: '/search?type=book' })

    await user.type(screen.getByLabelText('Search'), 'hobbit')
    await user.click(screen.getByRole('button', { name: 'Search' }))

    await waitFor(() => expect(searchApi.searchMedia).toHaveBeenCalledWith('book', 'hobbit'))
  })

  it('adds a result with the chosen status and placement', async () => {
    vi.mocked(searchApi.searchMedia).mockResolvedValue({ results: [inception] })
    const user = await searchFor('inception')

    await user.click(await screen.findByRole('button', { name: 'Add' }))
    await user.click(await screen.findByLabelText('Add to the top of the backlog'))
    await user.click(screen.getByRole('button', { name: 'Add' }))

    await waitFor(() =>
      expect(searchApi.fetchMediaDetails).toHaveBeenCalledWith('tmdb', '27205', 'movie'),
    )
    expect(entriesApi.addEntry).toHaveBeenCalledWith({
      mediaId: 'media-1',
      status: 'backlog',
      placement: 'top',
    })
    expect(toasts.success).toHaveBeenCalledWith('Added Inception')
  })

  it('hides the backlog placement option for other statuses', async () => {
    vi.mocked(searchApi.searchMedia).mockResolvedValue({ results: [inception] })
    const user = await searchFor('inception')

    await user.click(await screen.findByRole('button', { name: 'Add' }))
    expect(await screen.findByLabelText('Add to the top of the backlog')).toBeInTheDocument()

    await user.click(screen.getByLabelText('Status'))
    await user.click(await screen.findByRole('option', { name: 'Watching' }))

    expect(screen.queryByLabelText('Add to the top of the backlog')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Add' }))

    await waitFor(() =>
      expect(entriesApi.addEntry).toHaveBeenCalledWith({
        mediaId: 'media-1',
        status: 'in_progress',
        placement: 'bottom',
      }),
    )
  })

  it('opens the existing entry for a duplicate instead of failing', async () => {
    vi.mocked(searchApi.searchMedia).mockResolvedValue({ results: [inception] })
    vi.mocked(entriesApi.addEntry).mockRejectedValue(new DuplicateEntryError('entry-9'))
    const user = await searchFor('inception')

    await user.click(await screen.findByRole('button', { name: 'Add' }))
    await user.click(screen.getByRole('button', { name: 'Add' }))

    await waitFor(() => expect(toasts.info).toHaveBeenCalledWith('Already in your library'))
    expect(toasts.error).not.toHaveBeenCalled()
    expect(await screen.findByTestId('location')).toHaveTextContent('/library/entry-9')
  })

  it('surfaces the error when adding fails', async () => {
    vi.mocked(searchApi.searchMedia).mockResolvedValue({ results: [inception] })
    vi.mocked(searchApi.fetchMediaDetails).mockRejectedValue(new Error('TMDB is not configured'))
    const user = await searchFor('inception')

    await user.click(await screen.findByRole('button', { name: 'Add' }))
    await user.click(screen.getByRole('button', { name: 'Add' }))

    await waitFor(() => expect(toasts.error).toHaveBeenCalledWith('TMDB is not configured'))
  })

  it('shows results from healthy sources alongside a failed-source notice', async () => {
    vi.mocked(searchApi.searchMedia).mockResolvedValue({
      results: [inception],
      errors: [{ source: 'igdb', type: 'game', message: 'IGDB is not configured' }],
    })
    await searchFor('inception')

    expect(await screen.findByText('Inception')).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent(
      'Game results are unavailable right now (IGDB is not configured)',
    )
  })

  it('shows an empty state when nothing matches', async () => {
    vi.mocked(searchApi.searchMedia).mockResolvedValue({ results: [] })
    await searchFor('zzzz')
    expect(await screen.findByText(/Nothing found for/)).toBeInTheDocument()
  })

  it('shows the error when the search itself fails', async () => {
    vi.mocked(searchApi.searchMedia).mockRejectedValue(new Error('Search failed'))
    await searchFor('inception')
    expect(await screen.findByRole('alert')).toHaveTextContent('Search failed')
  })

  it('creates a custom item and adds it to the library', async () => {
    vi.mocked(searchApi.searchMedia).mockResolvedValue({ results: [] })
    vi.mocked(entriesApi.createCustomMedia).mockResolvedValue({
      id: 'media-custom',
      title: 'My Own Game',
    } as Media)
    const user = userEvent.setup()
    renderWithProviders(<SearchPage />)

    await user.click(screen.getByRole('button', { name: /Custom item/ }))
    // Scoped to the dialog: the search form has its own Type field.
    const dialog = within(await screen.findByRole('dialog'))
    await user.type(dialog.getByLabelText('Title'), 'My Own Game')
    await user.type(dialog.getByLabelText('Year'), '2024')
    await user.click(dialog.getByLabelText('Type'))
    await user.click(await screen.findByRole('option', { name: 'Game' }))
    await user.click(dialog.getByRole('button', { name: 'Create' }))

    await waitFor(() =>
      expect(entriesApi.createCustomMedia).toHaveBeenCalledWith({
        type: 'game',
        title: 'My Own Game',
        year: 2024,
        description: null,
        coverUrl: null,
      }),
    )
    expect(entriesApi.addEntry).toHaveBeenCalledWith({
      mediaId: 'media-custom',
      status: 'backlog',
    })
    expect(toasts.success).toHaveBeenCalledWith('Added My Own Game')
  })
})
