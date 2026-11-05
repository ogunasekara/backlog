import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as entriesApi from '@/lib/api/entries'
import { makeEntry } from '@/test/fixtures'
import { renderWithProviders } from '@/test/render'
import { LibraryPage } from './LibraryPage'

vi.mock('@/lib/api/entries', () => ({
  listEntries: vi.fn(),
  updateEntry: vi.fn(),
  setBacklogPositions: vi.fn(),
  nextBacklogPosition: vi.fn(),
}))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }))

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

  it("shows a started show's episode on its row, but not a new one's", async () => {
    const watching = makeEntry(
      { status: 'in_progress', tv_season: 2, tv_episode: 5 },
      { type: 'tv', title: 'Watching', details: { season_episode_counts: [8, 10] } },
    )
    const fresh = makeEntry({ status: 'backlog' }, { type: 'tv', title: 'Fresh' })
    vi.mocked(entriesApi.listEntries).mockResolvedValue([watching, fresh])
    renderWithProviders(<LibraryPage />, { route: '/library' })

    expect(await screen.findByRole('link', { name: /Watching/ })).toHaveTextContent('S2 E5')
    expect(screen.getByRole('link', { name: /Fresh/ })).not.toHaveTextContent(/S\d+ E\d+/)
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

describe('LibraryPage backlog order', () => {
  const first = makeEntry(
    { id: 'first', status: 'backlog', backlog_position: 'a0' },
    { type: 'game', title: 'First' },
  )
  const second = makeEntry(
    { id: 'second', status: 'backlog', backlog_position: 'a1' },
    { type: 'movie', title: 'Second' },
  )
  const third = makeEntry(
    { id: 'third', status: 'backlog', backlog_position: 'a2' },
    { type: 'game', title: 'Third' },
  )
  const done = makeEntry({ id: 'done', status: 'completed' }, { title: 'Done' })

  beforeEach(() => {
    let rows = [third, done, first, second]
    vi.mocked(entriesApi.listEntries).mockImplementation(async () => rows)
    vi.mocked(entriesApi.updateEntry).mockImplementation(async (id, patch) => {
      rows = rows.map((row) => (row.id === id ? { ...row, ...patch } : row))
      return rows.find((row) => row.id === id)!
    })
    vi.mocked(entriesApi.setBacklogPositions).mockImplementation(async (updates) => {
      const fresh = new Map(updates.map(({ id, position }) => [id, position]))
      rows = rows.map((row) =>
        fresh.has(row.id) ? { ...row, backlog_position: fresh.get(row.id)! } : row,
      )
    })

    // jsdom has no layout. Give each row a box from its place in the list, so
    // dnd-kit's keyboard sensor can measure where "down" is.
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (
      this: Element,
    ) {
      const item = this.closest('li')
      const index = item ? Array.from(item.parentElement!.children).indexOf(item) : 0
      const top = index * 100
      return {
        x: 0,
        y: top,
        top,
        left: 0,
        right: 300,
        bottom: top + 80,
        width: 300,
        height: 80,
        toJSON: () => ({}),
      }
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  const handles = () =>
    screen.queryAllByRole('button', { name: /^Reorder / }).map((handle) => handle.ariaLabel)

  it('shows the backlog in its order, with drag handles', async () => {
    renderWithProviders(<LibraryPage />, { route: '/library?status=backlog' })
    await screen.findByText('First')

    expect(rowTitles()).toEqual(['First', 'Second', 'Third'])
    expect(handles()).toEqual(['Reorder First', 'Reorder Second', 'Reorder Third'])
    expect(screen.getByLabelText('Sort by')).toHaveTextContent('Backlog order')
  })

  it('has no handles when the backlog is sorted some other way', async () => {
    renderWithProviders(<LibraryPage />, { route: '/library?status=backlog&sort=title' })
    await screen.findByText('First')
    expect(handles()).toEqual([])
  })

  it('has no handles outside the backlog', async () => {
    renderWithProviders(<LibraryPage />, { route: '/library' })
    await screen.findByText('First')
    expect(handles()).toEqual([])
  })

  it('reorders with the keyboard and writes only the moved entry', async () => {
    const user = userEvent.setup()
    renderWithProviders(<LibraryPage />, { route: '/library?status=backlog' })
    await screen.findByText('First')

    screen.getByRole('button', { name: 'Reorder First' }).focus()
    await user.keyboard(' ')
    await user.keyboard('{ArrowDown}')
    await user.keyboard(' ')

    await waitFor(() => expect(entriesApi.updateEntry).toHaveBeenCalledTimes(1))
    const [id, patch] = vi.mocked(entriesApi.updateEntry).mock.calls[0]!
    expect(id).toBe('first')
    expect(patch.backlog_position! > 'a1' && patch.backlog_position! < 'a2').toBe(true)
    await waitFor(() => expect(rowTitles()).toEqual(['Second', 'First', 'Third']))
  })

  it('shows the drop at once, before the cache update lands', async () => {
    const user = userEvent.setup()
    const { queryClient } = renderWithProviders(<LibraryPage />, {
      route: '/library?status=backlog',
    })
    await screen.findByText('First')
    // Hold the optimistic cache update (it waits on cancelQueries), as a slow tick would.
    vi.spyOn(queryClient, 'cancelQueries').mockReturnValue(new Promise(() => {}))

    screen.getByRole('button', { name: 'Reorder First' }).focus()
    await user.keyboard(' ')
    await user.keyboard('{ArrowDown}')
    await user.keyboard(' ')

    // Without the local copy of the drop, First would snap back to the top here.
    expect(rowTitles()).toEqual(['Second', 'First', 'Third'])
  })

  it('swaps games within their own slots, leaving the movie between them', async () => {
    const user = userEvent.setup()
    renderWithProviders(<LibraryPage />, { route: '/library?type=game&status=backlog' })
    await screen.findByText('First')
    expect(rowTitles()).toEqual(['First', 'Third'])

    screen.getByRole('button', { name: 'Reorder Third' }).focus()
    await user.keyboard(' ')
    await user.keyboard('{ArrowUp}')
    await user.keyboard(' ')

    // Both games change slots, so both are written together in one call.
    await waitFor(() => expect(entriesApi.setBacklogPositions).toHaveBeenCalledTimes(1))
    expect(entriesApi.updateEntry).not.toHaveBeenCalled()
    const updates = vi.mocked(entriesApi.setBacklogPositions).mock.calls[0]![0]
    expect(updates.map(({ id }) => id).sort()).toEqual(['first', 'third'])
    await waitFor(() => expect(rowTitles()).toEqual(['Third', 'First']))

    // In the whole backlog the games swapped slots 1 and 3; the movie stayed at 2.
    const positions = new Map(updates.map(({ id, position }) => [id, position]))
    const order = [first, second, third]
      .map((entry) => ({
        ...entry,
        backlog_position: positions.get(entry.id) ?? entry.backlog_position,
      }))
      .sort((a, b) => (a.backlog_position! < b.backlog_position! ? -1 : 1))
      .map((entry) => entry.media.title)
    expect(order).toEqual(['Third', 'Second', 'First'])
  })

  it('rolls the order back when the save fails', async () => {
    vi.mocked(entriesApi.updateEntry).mockRejectedValue(new Error('network down'))
    const user = userEvent.setup()
    renderWithProviders(<LibraryPage />, { route: '/library?status=backlog' })
    await screen.findByText('First')

    screen.getByRole('button', { name: 'Reorder First' }).focus()
    await user.keyboard(' ')
    await user.keyboard('{ArrowDown}')
    await user.keyboard(' ')

    await waitFor(() => expect(entriesApi.updateEntry).toHaveBeenCalled())
    await waitFor(() => expect(rowTitles()).toEqual(['First', 'Second', 'Third']))
  })
})
