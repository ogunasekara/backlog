import { Star } from 'lucide-react'
import { useId, useState } from 'react'
import { Button } from '@/components/ui/button'
import { formatStars, MAX_STARS, ratingToStars, starsToRating } from '@/lib/rating'
import { cn } from '@/lib/utils'

const STAR_INDEXES = Array.from({ length: MAX_STARS }, (_, i) => i + 1)

/** One star, filled fully, by half, or not at all. */
function StarGlyph({ fill, className }: { fill: 0 | 0.5 | 1; className?: string }) {
  return (
    <span className={cn('relative inline-block', className)} aria-hidden>
      <Star className="size-full text-muted-foreground/40" />
      {fill > 0 && (
        <Star
          className="absolute inset-0 size-full fill-amber-400 text-amber-400"
          style={{ clipPath: `inset(0 ${100 - fill * 100}% 0 0)` }}
        />
      )}
    </span>
  )
}

function fillFor(stars: number, index: number): 0 | 0.5 | 1 {
  if (stars >= index) return 1
  if (stars >= index - 0.5) return 0.5
  return 0
}

/** Read-only stars for list rows. */
export function StarDisplay({ rating, className }: { rating: number | null; className?: string }) {
  const stars = ratingToStars(rating)
  return (
    <span role="img" aria-label={formatStars(rating)} className={cn('flex', className)}>
      {STAR_INDEXES.map((index) => (
        <StarGlyph key={index} fill={fillFor(stars, index)} className="size-3.5" />
      ))}
    </span>
  )
}

type InputProps = {
  rating: number | null
  onChange: (rating: number | null) => void
  disabled?: boolean
}

/**
 * Five stars with half-steps, built on native radio inputs so arrow keys move through
 * the ten values. Each star has two hit areas: its left half and its right half.
 */
export function StarRatingInput({ rating, onChange, disabled }: InputProps) {
  const name = useId()
  const [hovered, setHovered] = useState<number | null>(null)
  const current = ratingToStars(rating)
  const shown = hovered ?? current

  return (
    <fieldset className="flex flex-wrap items-center gap-x-3 gap-y-1" disabled={disabled}>
      <legend className="sr-only">Rating</legend>
      <div className="flex" onMouseLeave={() => setHovered(null)}>
        {STAR_INDEXES.map((index) => (
          <span
            key={index}
            className="relative size-8 rounded-sm has-[input:focus-visible]:ring-2 has-[input:focus-visible]:ring-ring"
          >
            <StarGlyph fill={fillFor(shown, index)} className="size-full" />
            {[index - 0.5, index].map((value) => (
              <label
                key={value}
                className={cn(
                  'absolute inset-y-0 w-1/2 cursor-pointer',
                  value === index ? 'right-0' : 'left-0',
                )}
                onMouseEnter={() => setHovered(value)}
              >
                <input
                  type="radio"
                  name={name}
                  value={value}
                  checked={current === value}
                  onChange={() => onChange(starsToRating(value))}
                  className="sr-only"
                  aria-label={formatStars(starsToRating(value))}
                />
              </label>
            ))}
          </span>
        ))}
      </div>
      <span className="text-sm text-muted-foreground" aria-hidden>
        {rating === null ? 'Not rated' : current}
      </span>
      {rating !== null && (
        <Button type="button" variant="ghost" size="sm" onClick={() => onChange(null)}>
          Clear rating
        </Button>
      )}
    </fieldset>
  )
}
