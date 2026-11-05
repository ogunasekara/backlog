import { describe, expect, it } from 'vitest'
import { pageCountOf, progressFromPages, progressFromPercent } from './progress'

describe('pageCountOf', () => {
  it('reads a positive integer page count from the metadata', () => {
    expect(pageCountOf({ details: { page_count: 310 } })).toBe(310)
  })

  it('ignores a missing or unusable page count', () => {
    expect(pageCountOf({ details: {} })).toBeNull()
    expect(pageCountOf({ details: { page_count: 0 } })).toBeNull()
    expect(pageCountOf({ details: { page_count: '310' } })).toBeNull()
  })
})

describe('progressFromPages', () => {
  it('derives the percent when the page count is known', () => {
    expect(progressFromPages(155, 310)).toEqual({ progress_pages: 155, progress_percent: 50 })
    expect(progressFromPages(1, 3)).toEqual({ progress_pages: 1, progress_percent: 33 })
  })

  it('caps pages at the page count', () => {
    expect(progressFromPages(400, 310)).toEqual({ progress_pages: 310, progress_percent: 100 })
  })

  it('stores pages alone when the page count is unknown', () => {
    expect(progressFromPages(42, null)).toEqual({ progress_pages: 42, progress_percent: null })
  })

  it('clears both when the pages are cleared', () => {
    expect(progressFromPages(null, 310)).toEqual({ progress_pages: null, progress_percent: null })
  })

  it('never stores negative or fractional pages', () => {
    expect(progressFromPages(-5, 310)).toEqual({ progress_pages: 0, progress_percent: 0 })
    expect(progressFromPages(10.6, null)).toEqual({ progress_pages: 11, progress_percent: null })
  })
})

describe('progressFromPercent', () => {
  it('derives the page when the page count is known', () => {
    expect(progressFromPercent(25, 310)).toEqual({ progress_pages: 78, progress_percent: 25 })
  })

  it('stores the percent alone when the page count is unknown', () => {
    expect(progressFromPercent(25, null)).toEqual({ progress_pages: null, progress_percent: 25 })
  })

  it('clamps to 0-100', () => {
    expect(progressFromPercent(140, null)).toEqual({ progress_pages: null, progress_percent: 100 })
    expect(progressFromPercent(-3, 200)).toEqual({ progress_pages: 0, progress_percent: 0 })
  })
})
