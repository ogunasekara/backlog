import { describe, expect, it } from 'vitest'
import { localToday, statusTransition } from './status'
import type { EntryStatus } from './types'

const TODAY = '2026-11-04'

function entry(
  status: EntryStatus,
  started_on: string | null = null,
  finished_on: string | null = null,
) {
  return { status, started_on, finished_on }
}

describe('statusTransition', () => {
  it('does nothing when the status is unchanged', () => {
    expect(statusTransition(entry('in_progress'), 'in_progress', TODAY)).toEqual({
      patch: {},
      needsBacklogPosition: false,
    })
  })

  it('asks for a backlog position when moving into the backlog', () => {
    const { patch, needsBacklogPosition } = statusTransition(entry('dropped'), 'backlog', TODAY)
    expect(patch).toEqual({ status: 'backlog' })
    expect(needsBacklogPosition).toBe(true)
  })

  it('clears the backlog position when leaving the backlog', () => {
    const { patch, needsBacklogPosition } = statusTransition(entry('backlog'), 'on_hold', TODAY)
    expect(patch).toEqual({ status: 'on_hold', backlog_position: null })
    expect(needsBacklogPosition).toBe(false)
  })

  it('sets the start date when starting, if it is empty', () => {
    expect(statusTransition(entry('backlog'), 'in_progress', TODAY).patch).toEqual({
      status: 'in_progress',
      backlog_position: null,
      started_on: TODAY,
    })
  })

  it('keeps an existing start date when starting again', () => {
    const { patch } = statusTransition(entry('on_hold', '2026-01-02'), 'in_progress', TODAY)
    expect(patch).toEqual({ status: 'in_progress' })
  })

  it('sets the finish date when completing, if it is empty', () => {
    const { patch } = statusTransition(entry('in_progress', '2026-01-02'), 'completed', TODAY)
    expect(patch).toEqual({ status: 'completed', finished_on: TODAY })
  })

  it('keeps an existing finish date when completing again', () => {
    const { patch } = statusTransition(
      entry('dropped', '2026-01-02', '2026-02-03'),
      'completed',
      TODAY,
    )
    expect(patch).toEqual({ status: 'completed' })
  })

  it('sets only the finish date when going straight from backlog to completed', () => {
    const { patch } = statusTransition(entry('backlog'), 'completed', TODAY)
    expect(patch).toEqual({ status: 'completed', backlog_position: null, finished_on: TODAY })
    expect(patch).not.toHaveProperty('started_on')
  })

  it.each<EntryStatus>(['on_hold', 'dropped'])('leaves dates alone when moving to %s', (next) => {
    const { patch } = statusTransition(entry('in_progress', '2026-01-02'), next, TODAY)
    expect(patch).toEqual({ status: next })
  })

  it('never clears dates, even when moving back to the backlog', () => {
    const { patch } = statusTransition(
      entry('completed', '2026-01-02', '2026-02-03'),
      'backlog',
      TODAY,
    )
    expect(patch).toEqual({ status: 'backlog' })
  })
})

describe('localToday', () => {
  it('formats the local calendar date with zero padding', () => {
    expect(localToday(new Date(2026, 0, 5, 23, 59))).toBe('2026-01-05')
    expect(localToday(new Date(2026, 11, 31, 0, 0))).toBe('2026-12-31')
  })
})
