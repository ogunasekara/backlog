import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as entriesApi from '@/lib/api/entries'
import * as searchApi from '@/lib/api/search'
import type { EntryWithMedia } from '@/lib/types'
import { makeEntry } from '@/test/fixtures'
import { renderWithProviders } from '@/test/render'
import { EntryPage } from './EntryPage'

vi.mock('@/lib/api/entries', () => ({
  listEntries: vi.fn(),
  updateEntry: vi.fn(),
  removeEntry: vi.fn(),
  nextBacklogPosition: vi.fn(),
}))
vi.mock('@/lib/api/search')

const toasts = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn(), info: vi.fn() }))
vi.mock('sonner', () => ({ toast: toasts }))

const TODAY = '2026-11-04'

const inception = makeEntry(
  { id: 'inception', status: 'backlog', backlog_position: 'a0' },
  { type: 'movie', source: 'tmdb', external_id: '27205', title: 'Inception' },
)
const hobbit = makeEntry(
  { id: 'hobbit', status: 'in_progress', started_on: '2026-10-01' },
  {
    type: 'book',
    source: 'google_books',
    external_id: 'yl4dILkcqm4C',
    title: 'The Hobbit',
    details: { page_count: 310 },
  },
)
const custom = makeEntry(
  { id: 'custom', status: 'on_hold' },
  { type: 'game', source: 'custom', external_id: null, title: 'My Own Game', created_by: 'user-1' },
)

beforeEach(() => {
  vi.clearAllMocks()
  // Only Date is faked, so user-event's timers still run.
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(2026, 10, 4, 12))

  // A tiny stateful store, so the refetch after a save returns what was saved.
  let rows = [inception, hobbit, custom]
  vi.mocked(entriesApi.listEntries).mockImplementation(async () => rows)
  vi.mocked(entriesApi.updateEntry).mockImplementation(async (id, patch) => {
    rows = rows.map((row) => (row.id === id ? { ...row, ...patch } : row))
    return rows.find((row) => row.id === id)!
  })
})

afterEach(() => {
  vi.useRealTimers()
})

function open(entry: EntryWithMedia) {
  const user = userEvent.setup()
  renderWithProviders(<EntryPage />, { route: `/library/${entry.id}`, path: '/library/:entryId' })
  return user
}

async function chooseStatus(user: ReturnType<typeof userEvent.setup>, name: string) {
  await user.click(await screen.findByLabelText('Status'))
  await user.click(await screen.findByRole('option', { name }))
}

describe('EntryPage', () => {
  it('shows the item with per-type status labels', async () => {
    const user = open(hobbit)
    expect(await screen.findByRole('heading', { name: 'The Hobbit' })).toBeInTheDocument()
    expect(screen.getByLabelText('Status')).toHaveTextContent('Reading')

    await user.click(screen.getByLabelText('Status'))
    expect(await screen.findByRole('option', { name: 'Reading' })).toBeInTheDocument()
  })

  it('starting from the backlog clears the position and sets the start date', async () => {
    const user = open(inception)
    await chooseStatus(user, 'Watching')

    await waitFor(() =>
      expect(entriesApi.updateEntry).toHaveBeenCalledWith('inception', {
        status: 'in_progress',
        backlog_position: null,
        started_on: TODAY,
      }),
    )
  })

  it('moving into the backlog puts it at the bottom', async () => {
    vi.mocked(entriesApi.nextBacklogPosition).mockResolvedValue('a5')
    const user = open(custom)
    await chooseStatus(user, 'Backlog')

    await waitFor(() =>
      expect(entriesApi.updateEntry).toHaveBeenCalledWith('custom', {
        status: 'backlog',
        backlog_position: 'a5',
      }),
    )
    expect(entriesApi.nextBacklogPosition).toHaveBeenCalledWith('bottom')
  })

  it('shows a status change before the save finishes', async () => {
    vi.mocked(entriesApi.updateEntry).mockReturnValue(new Promise(() => {}))
    const user = open(inception)
    await chooseStatus(user, 'Completed')

    expect(screen.getByLabelText('Status')).toHaveTextContent('Completed')
    expect(screen.getByLabelText('Finished')).toHaveValue(TODAY)
  })

  it('rolls back and reports the error when a save fails', async () => {
    vi.mocked(entriesApi.updateEntry).mockRejectedValue(new Error('network down'))
    const user = open(inception)
    await chooseStatus(user, 'Completed')

    await waitFor(() => expect(toasts.error).toHaveBeenCalledWith('network down'))
    expect(screen.getByLabelText('Status')).toHaveTextContent('Backlog')
    expect(screen.getByLabelText('Finished')).toHaveValue('')
  })

  it('rates with half stars and clears the rating', async () => {
    const user = open(inception)
    await user.click(await screen.findByRole('radio', { name: '3.5 stars' }))
    await waitFor(() =>
      expect(entriesApi.updateEntry).toHaveBeenCalledWith('inception', { rating: 7 }),
    )

    await user.click(await screen.findByRole('button', { name: 'Clear rating' }))
    await waitFor(() =>
      expect(entriesApi.updateEntry).toHaveBeenLastCalledWith('inception', { rating: null }),
    )
  })

  it('saves notes when leaving the field', async () => {
    const user = open(inception)
    await user.type(await screen.findByLabelText('Notes'), 'Watch with subtitles')
    expect(entriesApi.updateEntry).not.toHaveBeenCalled()

    await user.tab()
    await waitFor(() =>
      expect(entriesApi.updateEntry).toHaveBeenCalledWith('inception', {
        notes: 'Watch with subtitles',
      }),
    )
  })

  it('saves a date once it is complete, and can clear it', async () => {
    open(hobbit)
    const started = await screen.findByLabelText('Started')
    expect(started).toHaveValue('2026-10-01')

    // A partially typed year is not saved.
    fireEvent.change(started, { target: { value: '0202-10-05' } })
    expect(entriesApi.updateEntry).not.toHaveBeenCalled()

    fireEvent.change(started, { target: { value: '2026-10-05' } })
    await waitFor(() =>
      expect(entriesApi.updateEntry).toHaveBeenCalledWith('hobbit', { started_on: '2026-10-05' }),
    )

    fireEvent.change(started, { target: { value: '' } })
    await waitFor(() =>
      expect(entriesApi.updateEntry).toHaveBeenLastCalledWith('hobbit', { started_on: null }),
    )
  })

  it('derives the book percent from pages', async () => {
    const user = open(hobbit)
    expect(await screen.findByLabelText('Page (of 310)')).toBeInTheDocument()

    await user.type(screen.getByLabelText('Page (of 310)'), '155')
    await user.tab()

    await waitFor(() =>
      expect(entriesApi.updateEntry).toHaveBeenCalledWith('hobbit', {
        progress_pages: 155,
        progress_percent: 50,
      }),
    )
    expect(screen.getByLabelText('Percent')).toHaveValue(50)
  })

  it('does not save progress when passing through an untouched field', async () => {
    const user = open(hobbit)
    await user.click(await screen.findByLabelText('Page (of 310)'))
    await user.tab()
    await user.tab()
    expect(entriesApi.updateEntry).not.toHaveBeenCalled()
  })

  it('hides book progress for other types', async () => {
    open(inception)
    await screen.findByRole('heading', { name: 'Inception' })
    expect(screen.queryByText('Progress')).not.toBeInTheDocument()
  })

  it('refreshes catalog metadata through the details function', async () => {
    vi.mocked(searchApi.fetchMediaDetails).mockResolvedValue({
      ...inception.media,
      title: 'Inception (2010)',
    })
    const user = open(inception)
    await user.click(await screen.findByRole('button', { name: 'Refresh metadata' }))

    expect(searchApi.fetchMediaDetails).toHaveBeenCalledWith('tmdb', '27205', 'movie')
    expect(await screen.findByRole('heading', { name: 'Inception (2010)' })).toBeInTheDocument()
    expect(toasts.success).toHaveBeenCalledWith('Metadata refreshed')
  })

  it('offers no refresh for custom items', async () => {
    open(custom)
    await screen.findByRole('heading', { name: 'My Own Game' })
    expect(screen.queryByRole('button', { name: 'Refresh metadata' })).not.toBeInTheDocument()
  })

  it('removes the entry after confirming and returns to the library', async () => {
    vi.mocked(entriesApi.removeEntry).mockResolvedValue()
    const user = open(inception)
    await user.click(await screen.findByRole('button', { name: 'Remove' }))
    expect(entriesApi.removeEntry).not.toHaveBeenCalled()

    const dialog = await screen.findByRole('dialog')
    await user.click(within(dialog).getByRole('button', { name: 'Remove' }))

    await waitFor(() => expect(entriesApi.removeEntry).toHaveBeenCalled())
    expect(vi.mocked(entriesApi.removeEntry).mock.calls[0]?.[0]).toMatchObject({ id: 'inception' })
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent(/^\/library$/))
    expect(toasts.success).toHaveBeenCalledWith('Removed Inception')
  })

  it('says so when the entry is not in the library', async () => {
    const user = userEvent.setup()
    renderWithProviders(<EntryPage />, { route: '/library/missing', path: '/library/:entryId' })
    expect(await screen.findByText("This item isn't in your library.")).toBeInTheDocument()

    await user.click(screen.getByRole('link', { name: 'Library' }))
    expect(screen.getByTestId('location')).toHaveTextContent(/^\/library$/)
  })
})
