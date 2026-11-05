import { onlineManager } from '@tanstack/react-query'
import { act, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as entriesApi from '@/lib/api/entries'
import * as searchApi from '@/lib/api/search'
import type { Entry, EntryWithMedia, Media } from '@/lib/types'
import { makeEntry } from '@/test/fixtures'
import { entriesKey } from '@/lib/api/keys'
import { renderWithProviders, testQueryClient } from '@/test/render'
import { EntryPage } from './EntryPage'

vi.mock('@/lib/api/entries', () => ({
  listEntries: vi.fn(),
  updateEntry: vi.fn(),
  removeEntry: vi.fn(),
  setBacklogPositions: vi.fn(),
  nextBacklogPosition: vi.fn(),
}))
vi.mock('@/lib/api/search')

const toasts = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn(), info: vi.fn() }))
vi.mock('sonner', () => ({ toast: toasts }))

const TODAY = '2026-11-04'

function show(overrides: Partial<Entry>, counts: number[] | null, media: Partial<Media> = {}) {
  return makeEntry(
    { id: 'show', ...overrides },
    {
      type: 'tv',
      source: 'tmdb',
      external_id: '1396',
      title: 'The Show',
      details: counts ? { season_episode_counts: counts } : {},
      ...media,
    },
  )
}

let rows: EntryWithMedia[] = []

beforeEach(() => {
  vi.clearAllMocks()
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(2026, 10, 4, 12))

  vi.mocked(entriesApi.listEntries).mockImplementation(async () => rows)
  vi.mocked(entriesApi.updateEntry).mockImplementation(async (id, patch) => {
    rows = rows.map((row) => (row.id === id ? { ...row, ...patch } : row))
    return rows.find((row) => row.id === id)!
  })
  // The automatic refresh returns the same metadata unless a test says otherwise.
  vi.mocked(searchApi.fetchMediaDetails).mockImplementation(
    async () => rows.find(({ id }) => id === 'show')!.media,
  )
})

afterEach(() => {
  vi.useRealTimers()
})

function open(entry: EntryWithMedia) {
  rows = [entry]
  const user = userEvent.setup()
  renderWithProviders(<EntryPage />, { route: `/library/${entry.id}`, path: '/library/:entryId' })
  return user
}

const position = () => screen.getByTestId('tv-position')

describe('TV progress', () => {
  it('shows a new show as not started, with S1 E1 up next', async () => {
    open(show({ status: 'in_progress' }, [3, 2]))
    expect(await screen.findByText('Not started')).toBeInTheDocument()
    expect(screen.getByText(/Up next: S1 E1/)).toBeInTheDocument()
  })

  it('steps through a multi-season show and ends with the Completed prompt', async () => {
    const user = open(show({ status: 'in_progress', started_on: '2026-10-01' }, [2, 1, 2]))
    const next = await screen.findByRole('button', { name: 'Next episode' })

    const seen: string[] = []
    for (let i = 0; i < 4; i++) {
      await user.click(next)
      seen.push(position().textContent!)
    }
    expect(seen).toEqual(['S1 E1', 'S1 E2', 'S2 E1', 'S3 E1'])
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()

    await user.click(next)
    expect(position()).toHaveTextContent('S3 E2')
    const dialog = await screen.findByRole('dialog', { name: 'That was the last episode' })
    await user.click(within(dialog).getByRole('button', { name: 'Mark completed' }))

    await waitFor(() =>
      expect(entriesApi.updateEntry).toHaveBeenLastCalledWith('show', {
        status: 'completed',
        finished_on: TODAY,
      }),
    )
    expect(entriesApi.updateEntry).toHaveBeenCalledWith('show', { tv_season: 3, tv_episode: 2 })
    expect(screen.getByText(/You’ve watched every episode/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Next episode' })).not.toBeInTheDocument()
    expect(screen.getByLabelText('Status')).toHaveTextContent('Completed')
  })

  it('can decline the Completed prompt and accept it later', async () => {
    const user = open(show({ status: 'in_progress', tv_season: 2, tv_episode: 1 }, [3, 2]))
    await user.click(await screen.findByRole('button', { name: 'Next episode' }))
    await user.click(await screen.findByRole('button', { name: 'Not now' }))

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getByLabelText('Status')).toHaveTextContent('Watching')

    await user.click(screen.getByRole('button', { name: 'Mark completed' }))
    expect(
      await screen.findByRole('dialog', { name: 'That was the last episode' }),
    ).toBeInTheDocument()
  })

  it('asks to move a backlog show to Watching on the first episode', async () => {
    const user = open(show({ status: 'backlog', backlog_position: 'a0' }, [3, 2]))
    await user.click(await screen.findByRole('button', { name: 'Next episode' }))

    expect(entriesApi.updateEntry).toHaveBeenCalledWith('show', { tv_season: 1, tv_episode: 1 })
    const dialog = await screen.findByRole('dialog', { name: 'Started watching?' })
    await user.click(within(dialog).getByRole('button', { name: 'Move to Watching' }))

    await waitFor(() =>
      expect(entriesApi.updateEntry).toHaveBeenLastCalledWith('show', {
        status: 'in_progress',
        backlog_position: null,
        started_on: TODAY,
      }),
    )
  })

  it("doesn't force the move, and doesn't ask again after you decline", async () => {
    const user = open(show({ status: 'backlog', backlog_position: 'a0' }, [3, 2]))
    const next = await screen.findByRole('button', { name: 'Next episode' })
    await user.click(next)
    await user.click(await screen.findByRole('button', { name: 'Keep as Backlog' }))
    await user.click(next)

    expect(position()).toHaveTextContent('S1 E2')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getByLabelText('Status')).toHaveTextContent('Backlog')
    expect(entriesApi.updateEntry).not.toHaveBeenCalledWith(
      'show',
      expect.objectContaining({ status: expect.anything() }),
    )
  })

  it('a one-episode show from the backlog asks to complete, not to start', async () => {
    const user = open(show({ status: 'backlog', backlog_position: 'a0' }, [1]))
    await user.click(await screen.findByRole('button', { name: 'Next episode' }))
    expect(
      await screen.findByRole('dialog', { name: 'That was the last episode' }),
    ).toBeInTheDocument()
  })

  it('refreshes the seasons when an in-progress show opens, quietly', async () => {
    vi.mocked(searchApi.fetchMediaDetails).mockImplementation(async () => ({
      ...rows[0]!.media,
      details: { season_episode_counts: [3, 2, 8] },
    }))
    open(show({ status: 'in_progress', tv_season: 2, tv_episode: 2 }, [3, 2]))

    // Finished as far as the old metadata knows; the refresh brings a new season.
    expect(await screen.findByText(/Up next: S3 E1/)).toBeInTheDocument()
    expect(searchApi.fetchMediaDetails).toHaveBeenCalledTimes(1)
    expect(searchApi.fetchMediaDetails).toHaveBeenCalledWith('tmdb', '1396', 'tv')
    expect(toasts.success).not.toHaveBeenCalled()
  })

  it('a failed automatic refresh keeps the cached seasons without an error toast', async () => {
    vi.mocked(searchApi.fetchMediaDetails).mockRejectedValue(new Error('offline'))
    open(show({ status: 'in_progress', tv_season: 1, tv_episode: 1 }, [3, 2]))

    await waitFor(() => expect(searchApi.fetchMediaDetails).toHaveBeenCalled())
    expect(screen.getByText(/Up next: S1 E2/)).toBeInTheDocument()
    expect(toasts.error).not.toHaveBeenCalled()
  })

  it("doesn't refresh a show that isn't in progress, or a custom one", async () => {
    open(show({ status: 'backlog', backlog_position: 'a0' }, [3, 2]))
    await screen.findByText('Not started')
    expect(searchApi.fetchMediaDetails).not.toHaveBeenCalled()
  })

  it('opened offline from the cache, it waits for a connection to refresh or step', async () => {
    rows = [show({ status: 'in_progress' }, [3, 2])]
    const queryClient = testQueryClient()
    queryClient.setQueryData(entriesKey, rows)
    onlineManager.setOnline(false)

    renderWithProviders(<EntryPage />, {
      route: '/library/show',
      path: '/library/:entryId',
      queryClient,
    })

    expect(await screen.findByRole('button', { name: 'Next episode' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Set position' })).toBeDisabled()
    expect(searchApi.fetchMediaDetails).not.toHaveBeenCalled()

    act(() => onlineManager.setOnline(true))
    await waitFor(() => expect(searchApi.fetchMediaDetails).toHaveBeenCalledTimes(1))
    expect(screen.getByRole('button', { name: 'Next episode' })).toBeEnabled()
  })

  it('clamps a pointer that a smaller episode count left out of range', async () => {
    const user = open(show({ status: 'completed', tv_season: 1, tv_episode: 9 }, [3, 2]))
    expect(await screen.findByTestId('tv-position')).toHaveTextContent('S1 E3')

    await user.click(screen.getByRole('button', { name: 'Next episode' }))
    expect(entriesApi.updateEntry).toHaveBeenCalledWith('show', { tv_season: 2, tv_episode: 1 })
  })

  it('sets the position by hand, checking it against the seasons', async () => {
    const user = open(show({ status: 'in_progress', tv_season: 1, tv_episode: 1 }, [3, 2]))
    await user.click(await screen.findByRole('button', { name: 'Set position' }))
    const dialog = await screen.findByRole('dialog', { name: 'Set position' })

    const season = within(dialog).getByLabelText('Season (of 2)')
    await user.clear(season)
    await user.type(season, '2')
    const episode = within(dialog).getByLabelText('Episode (of 2)')
    await user.clear(episode)
    await user.type(episode, '5')
    await user.click(within(dialog).getByRole('button', { name: 'Save' }))
    expect(within(dialog).getByRole('alert')).toHaveTextContent('season from 1 to 2')

    await user.clear(episode)
    await user.type(episode, '1')
    await user.click(within(dialog).getByRole('button', { name: 'Save' }))

    expect(entriesApi.updateEntry).toHaveBeenCalledWith('show', { tv_season: 2, tv_episode: 1 })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(position()).toHaveTextContent('S2 E1')
  })

  it('setting the final episode offers to complete', async () => {
    const user = open(show({ status: 'in_progress' }, [3, 2]))
    await user.click(await screen.findByRole('button', { name: 'Set position' }))
    const dialog = await screen.findByRole('dialog', { name: 'Set position' })
    await user.clear(within(dialog).getByLabelText('Season (of 2)'))
    await user.type(within(dialog).getByLabelText('Season (of 2)'), '2')
    await user.clear(within(dialog).getByLabelText('Episode (of 2)'))
    await user.type(within(dialog).getByLabelText('Episode (of 2)'), '2')
    await user.click(within(dialog).getByRole('button', { name: 'Save' }))

    expect(
      await screen.findByRole('dialog', { name: 'That was the last episode' }),
    ).toBeInTheDocument()
  })

  it('a custom show with no seasons counts up without rolling over or finishing', async () => {
    const user = open(
      show({ status: 'in_progress', tv_season: 2, tv_episode: 40 }, null, {
        source: 'custom',
        external_id: null,
        created_by: 'user-1',
      }),
    )
    await user.click(await screen.findByRole('button', { name: 'Next episode' }))

    expect(position()).toHaveTextContent('S2 E41')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(searchApi.fetchMediaDetails).not.toHaveBeenCalled()
  })

  describe('a show that is still airing', () => {
    // Nocturne as TMDB had it on 2026-11-05: 10 listed, 2 aired, episode 3 due that day.
    const nocturne = {
      season_episode_counts: [10],
      last_aired: { season: 1, episode: 2 },
      next_air: { season: 1, episode: 3, air_date: '2026-11-05' },
      ended: false,
    }
    const airing = (overrides: Partial<Entry>) =>
      show({ status: 'in_progress', ...overrides }, null, { details: nocturne })

    it('steps through the aired episodes, then shows when the next one airs', async () => {
      const user = open(airing({ tv_season: 1, tv_episode: 1 }))
      await user.click(await screen.findByRole('button', { name: 'Next episode' }))

      expect(position()).toHaveTextContent('S1 E2')
      expect(screen.getByText(/S1 E3 airs Nov 5, 2026/)).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Next episode' })).not.toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Mark completed' })).not.toBeInTheDocument()
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })

    it('offers the scheduled episode once its air date arrives', async () => {
      vi.setSystemTime(new Date(2026, 10, 5, 9))
      open(airing({ tv_season: 1, tv_episode: 2 }))
      expect(await screen.findByText(/Up next: S1 E3/)).toBeInTheDocument()
    })

    it('a refresh that brings a newly aired episode makes it up next', async () => {
      vi.mocked(searchApi.fetchMediaDetails).mockImplementation(async () => ({
        ...rows[0]!.media,
        details: {
          ...nocturne,
          last_aired: { season: 1, episode: 3 },
          next_air: { season: 1, episode: 4, air_date: '2026-11-12' },
        },
      }))
      open(airing({ tv_season: 1, tv_episode: 2 }))
      expect(await screen.findByText(/Up next: S1 E3/)).toBeInTheDocument()
    })

    it('is caught up, with no Completed prompt, at the end of a season with more to come', async () => {
      const between = {
        season_episode_counts: [3],
        last_aired: { season: 1, episode: 3 },
        next_air: null,
        ended: false,
      }
      const user = open(
        show({ status: 'in_progress', tv_season: 1, tv_episode: 2 }, null, { details: between }),
      )
      await user.click(await screen.findByRole('button', { name: 'Next episode' }))

      expect(position()).toHaveTextContent('S1 E3')
      expect(screen.getByText(/You’re caught up/)).toBeInTheDocument()
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Mark completed' })).not.toBeInTheDocument()
    })

    it('still lets you set a position past the aired episodes', async () => {
      const user = open(airing({ tv_season: 1, tv_episode: 2 }))
      await user.click(await screen.findByRole('button', { name: 'Set position' }))
      const dialog = await screen.findByRole('dialog', { name: 'Set position' })
      const episode = within(dialog).getByLabelText('Episode (of 10)')
      await user.clear(episode)
      await user.type(episode, '10')
      await user.click(within(dialog).getByRole('button', { name: 'Save' }))

      expect(entriesApi.updateEntry).toHaveBeenCalledWith('show', { tv_season: 1, tv_episode: 10 })
      // The last listed episode of a show that isn't over: no Completed prompt.
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })
  })
})
