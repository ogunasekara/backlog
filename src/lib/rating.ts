/** Ratings are stored as integers 1-10 and shown as five stars with half-steps. */

export const MAX_STARS = 5

export function ratingToStars(rating: number | null): number {
  return rating === null ? 0 : rating / 2
}

/** Zero stars means no rating. Anything else rounds to the nearest half star. */
export function starsToRating(stars: number): number | null {
  const rating = Math.round(stars * 2)
  if (rating <= 0) return null
  return Math.min(rating, MAX_STARS * 2)
}

export function formatStars(rating: number | null): string {
  if (rating === null) return 'Not rated'
  const stars = ratingToStars(rating)
  return `${stars} ${stars === 1 ? 'star' : 'stars'}`
}
