import { describe, expect, it } from 'vitest'
import { formatStars, ratingToStars, starsToRating } from './rating'

describe('rating', () => {
  it('maps every half star to the 1-10 scale and back', () => {
    for (let rating = 1; rating <= 10; rating++) {
      expect(starsToRating(ratingToStars(rating))).toBe(rating)
    }
    expect(starsToRating(0.5)).toBe(1)
    expect(starsToRating(3.5)).toBe(7)
    expect(starsToRating(5)).toBe(10)
  })

  it('treats zero stars as no rating', () => {
    expect(starsToRating(0)).toBeNull()
    expect(ratingToStars(null)).toBe(0)
  })

  it('rounds to the nearest half star and caps at five', () => {
    expect(starsToRating(2.3)).toBe(5)
    expect(starsToRating(7)).toBe(10)
  })

  it('formats for screen readers and labels', () => {
    expect(formatStars(null)).toBe('Not rated')
    expect(formatStars(2)).toBe('1 star')
    expect(formatStars(7)).toBe('3.5 stars')
  })
})
