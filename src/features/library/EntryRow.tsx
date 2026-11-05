import type { ReactNode } from 'react'
import { Link } from 'react-router'
import { CoverImage } from '@/components/CoverImage'
import { StarDisplay } from '@/components/StarRating'
import { Badge } from '@/components/ui/badge'
import { MEDIA_TYPE_LABELS, statusLabel } from '@/lib/labels'
import type { EntryWithMedia } from '@/lib/types'
import { cn } from '@/lib/utils'

type Props = {
  entry: EntryWithMedia
  /** A drag handle, kept outside the link so the two stay separate controls. */
  handle?: ReactNode
  /** The backlog view leaves out the status badge, since every row there is Backlog. */
  hideStatus?: boolean
}

export function EntryRow({ entry, handle, hideStatus }: Props) {
  const { media } = entry
  return (
    <div className="flex items-center rounded-lg border bg-background transition-colors has-[a:focus-visible]:ring-2 has-[a:focus-visible]:ring-ring has-[a:hover]:bg-accent">
      {handle}
      <Link
        to={`/library/${entry.id}`}
        className={cn(
          'flex min-w-0 flex-1 items-center gap-3 p-3 focus-visible:outline-none',
          handle && 'pl-1',
        )}
      >
        <CoverImage title={media.title} url={media.cover_url} className="w-12 shrink-0" />
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <p className="truncate font-medium">{media.title}</p>
          <p className="text-sm text-muted-foreground">
            {MEDIA_TYPE_LABELS[media.type]}
            {media.year ? ` · ${media.year}` : ''}
            {media.type === 'book' && entry.progress_percent !== null
              ? ` · ${entry.progress_percent}%`
              : ''}
          </p>
          {entry.rating !== null && <StarDisplay rating={entry.rating} />}
        </div>
        {!hideStatus && (
          <Badge variant="secondary" className="shrink-0">
            {statusLabel(entry.status, media.type)}
          </Badge>
        )}
      </Link>
    </div>
  )
}
