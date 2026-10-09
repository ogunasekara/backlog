import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router'
import { CoverImage } from '@/components/CoverImage'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { listEntries } from '@/lib/api/entries'
import { entriesKey } from '@/lib/api/keys'
import { MEDIA_TYPE_LABELS, statusLabel } from '@/lib/labels'

/**
 * A plain list of everything added, newest first. Phase 4 replaces this with the
 * real library screen (type tabs, status filters, sorting and the entry detail).
 */
export function LibraryPage() {
  const entries = useQuery({ queryKey: entriesKey, queryFn: listEntries })

  return (
    <section className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold">Library</h1>

      {entries.isPending && (
        <div className="flex flex-col gap-3">
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="h-20 w-full" />
          ))}
        </div>
      )}

      {entries.isError && (
        <p role="alert" className="text-sm text-destructive">
          {entries.error instanceof Error ? entries.error.message : 'Could not load your library'}
        </p>
      )}

      {entries.data?.length === 0 && (
        <div className="flex flex-col items-start gap-3">
          <p className="text-muted-foreground">Your library is empty.</p>
          <Button asChild>
            <Link to="/search">Find something to add</Link>
          </Button>
        </div>
      )}

      {(entries.data?.length ?? 0) > 0 && (
        <ul className="flex flex-col gap-3">
          {entries.data?.map((entry) => (
            <li key={entry.id} className="flex items-center gap-3 rounded-lg border p-3">
              <CoverImage
                title={entry.media.title}
                url={entry.media.cover_url}
                className="w-12 shrink-0"
              />
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{entry.media.title}</p>
                <p className="text-sm text-muted-foreground">
                  {MEDIA_TYPE_LABELS[entry.media.type]}
                  {entry.media.year ? ` · ${entry.media.year}` : ''}
                </p>
              </div>
              <Badge variant="secondary">{statusLabel(entry.status, entry.media.type)}</Badge>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
