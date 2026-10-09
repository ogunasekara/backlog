import { useState } from 'react'
import { cn } from '@/lib/utils'

/** Stable hue per title, so an item's placeholder looks the same on every screen. */
function hueFor(title: string): number {
  let hash = 0
  for (let i = 0; i < title.length; i++) hash = (hash * 31 + title.charCodeAt(i)) % 360
  return hash
}

function initials(title: string): string {
  const words = title
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter(Boolean)
  if (words.length === 0) return '?'
  return words
    .slice(0, 2)
    .map((word) => word[0]!.toUpperCase())
    .join('')
}

type Props = {
  title: string
  url?: string | null
  className?: string
}

/**
 * Covers are hotlinked from the source CDNs, so a dead or blocked URL is expected.
 * When that happens the generated placeholder takes over.
 */
export function CoverImage({ title, url, className }: Props) {
  // Remembering which URL failed (rather than a boolean) means a new URL is
  // retried automatically, with no effect needed to reset the flag.
  const [failedUrl, setFailedUrl] = useState<string | null>(null)
  const failed = url != null && failedUrl === url

  const shared = cn('aspect-[2/3] w-full overflow-hidden rounded-md bg-muted', className)

  if (!url || failed) {
    const hue = hueFor(title)
    return (
      <div
        aria-hidden
        className={cn(shared, 'flex items-center justify-center')}
        style={{
          backgroundImage: `linear-gradient(145deg, oklch(0.72 0.12 ${hue}), oklch(0.52 0.14 ${(hue + 40) % 360}))`,
        }}
      >
        <span className="text-xl font-semibold text-white/90 drop-shadow">{initials(title)}</span>
      </div>
    )
  }

  return (
    <img
      src={url}
      alt=""
      loading="lazy"
      className={cn(shared, 'object-cover')}
      onError={() => setFailedUrl(url)}
    />
  )
}
