import { useQuery } from '@tanstack/react-query'
import { ArrowDownToLine, ArrowLeft, ArrowUpToLine, RefreshCw, Trash2 } from 'lucide-react'
import { useState, type ChangeEvent } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router'
import { CoverImage } from '@/components/CoverImage'
import { LoadError } from '@/components/LoadError'
import { StarRatingInput } from '@/components/StarRating'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'
import { listEntries } from '@/lib/api/entries'
import { entriesKey } from '@/lib/api/keys'
import { compareBacklog } from '@/lib/backlog'
import { useOnline } from '@/lib/online'
import { MEDIA_TYPE_LABELS, SOURCE_LABELS, statusLabel } from '@/lib/labels'
import { pageCountOf, progressFromPages, progressFromPercent } from '@/lib/progress'
import type { EntryPatch } from '@/lib/status'
import { ENTRY_STATUSES, type EntryStatus, type EntryWithMedia } from '@/lib/types'
import { TvProgress } from './TvProgress'
import {
  useChangeStatus,
  useMoveInBacklog,
  useRefreshMetadata,
  useRemoveEntry,
  useUpdateEntry,
} from './useEntryMutations'

/**
 * Local edits for a field that saves later (on blur, or once complete). Resets when
 * the saved value changes underneath, e.g. a status change auto-filling a date.
 */
function useDraft(value: string) {
  const [draft, setDraft] = useState(value)
  const [synced, setSynced] = useState(value)
  if (value !== synced) {
    setSynced(value)
    setDraft(value)
  }
  return [draft, setDraft] as const
}

function parseWhole(text: string): number | null {
  if (!text.trim()) return null
  const value = Number(text)
  return Number.isFinite(value) ? value : null
}

export function EntryPage() {
  const { entryId } = useParams()
  const entries = useQuery({ queryKey: entriesKey, queryFn: listEntries })
  const entry = entries.data?.find(({ id }) => id === entryId)

  if (entries.isPending) {
    return (
      <div className="flex flex-col gap-4">
        <Skeleton className="h-6 w-24" />
        <div className="flex gap-4">
          <Skeleton className="aspect-[2/3] w-28" />
          <Skeleton className="h-8 flex-1" />
        </div>
      </div>
    )
  }

  // A failed refresh with a cached library still shows the cached entry.
  if (entries.isError && !entries.data) {
    return (
      <LoadError
        message={
          entries.error instanceof Error ? entries.error.message : 'Could not load this item'
        }
        onRetry={() => void entries.refetch()}
      />
    )
  }

  if (!entries.data || !entry) {
    return (
      <section className="flex flex-col items-start gap-3">
        <BackLink className="-ml-2.5 text-muted-foreground" />
        <p className="text-muted-foreground">This item isn't in your library.</p>
      </section>
    )
  }

  // Keyed by id so the drafts start fresh when moving between entries.
  // The whole backlog across types, for the entry's position and move to top/bottom.
  const backlog = entries.data.filter(({ status }) => status === 'backlog').sort(compareBacklog)

  return <EntryDetail key={entry.id} entry={entry} backlog={backlog} />
}

function BackLink({ className }: { className?: string }) {
  const navigate = useNavigate()
  const location = useLocation()
  // Going back keeps the library's tab and filters; a direct visit has nowhere to go back to.
  const canGoBack = location.key !== 'default'

  return (
    <Button asChild variant="ghost" size="sm" className={className}>
      <Link
        to="/library"
        onClick={(event) => {
          if (!canGoBack) return
          event.preventDefault()
          void navigate(-1)
        }}
      >
        <ArrowLeft aria-hidden />
        Library
      </Link>
    </Button>
  )
}

function EntryDetail({ entry, backlog }: { entry: EntryWithMedia; backlog: EntryWithMedia[] }) {
  const { media } = entry
  const navigate = useNavigate()
  const update = useUpdateEntry()
  const { changeStatus } = useChangeStatus()
  const { moveToTop, moveToBottom } = useMoveInBacklog()
  const rank = backlog.findIndex(({ id }) => id === entry.id)
  const refresh = useRefreshMetadata()
  const [confirmRemove, setConfirmRemove] = useState(false)
  const remove = useRemoveEntry({ onRemoved: () => void navigate('/library', { replace: true }) })
  // Writes need a connection. The fieldset disables every native control inside it;
  // the Radix select and the buttons outside it take the flag themselves.
  const offline = !useOnline()

  function save(patch: EntryPatch) {
    update.mutate({ id: entry.id, patch })
  }

  return (
    <section className="flex max-w-2xl flex-col gap-6">
      <div className="-mb-3">
        <BackLink className="-ml-2.5 text-muted-foreground" />
      </div>

      {/*
        Mobile: a small cover beside the title, with the description full width below.
        From sm up the cover spans both rows; `auto_1fr` rows keep its extra height out
        of the gap between the title and the description. `items-start` stops the cover
        stretching to the text's height, which would crop it out of its 2:3 shape.
      */}
      <div className="grid grid-cols-[6rem_minmax(0,1fr)] items-start gap-x-4 gap-y-3 sm:grid-cols-[9rem_minmax(0,1fr)] sm:grid-rows-[auto_1fr]">
        <CoverImage title={media.title} url={media.cover_url} className="sm:row-span-2" />
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold break-words">{media.title}</h1>
          <p className="text-sm text-muted-foreground">
            {MEDIA_TYPE_LABELS[media.type]}
            {media.year ? ` · ${media.year}` : ''} · {SOURCE_LABELS[media.source]}
          </p>
        </div>
        {media.description && (
          <p className="col-span-2 line-clamp-6 text-sm text-muted-foreground sm:col-span-1 sm:col-start-2">
            {media.description}
          </p>
        )}
      </div>

      <Card className="py-5">
        {/* Two columns from sm up: Status | Rating, then Started | Finished. */}
        <CardContent className="px-5">
          {/* min-w-0: a fieldset is at least as wide as its content by default. */}
          <fieldset disabled={offline} className="grid min-w-0 gap-x-3 gap-y-5 sm:grid-cols-2">
            <div className="flex flex-col gap-2">
              <Label htmlFor="entry-status">Status</Label>
              <Select
                value={entry.status}
                disabled={offline}
                onValueChange={(next) => changeStatus(entry, next as EntryStatus)}
              >
                <SelectTrigger id="entry-status" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ENTRY_STATUSES.map((value) => (
                    <SelectItem key={value} value={value}>
                      {statusLabel(value, media.type)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {rank !== -1 && (
                // Icon-only, so the position and both buttons share one line even in a
                // half-width column; the labels live on as accessible names and tooltips.
                <div className="flex items-center gap-1 text-xs text-muted-foreground">
                  <span className="mr-auto">
                    {rank + 1} of {backlog.length} in your backlog
                  </span>
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    aria-label="Move to top"
                    title="Move to top"
                    onClick={() => moveToTop(backlog, entry.id)}
                    disabled={rank === 0}
                  >
                    <ArrowUpToLine aria-hidden />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    aria-label="Move to bottom"
                    title="Move to bottom"
                    onClick={() => moveToBottom(backlog, entry.id)}
                    disabled={rank === backlog.length - 1}
                  >
                    <ArrowDownToLine aria-hidden />
                  </Button>
                </div>
              )}
            </div>

            <div className="flex flex-col gap-2">
              <span className="text-sm leading-none font-medium">Rating</span>
              <StarRatingInput
                rating={entry.rating}
                onChange={(rating) => save({ rating })}
                disabled={offline}
              />
            </div>

            {/* Paired on mobile too; from sm up the dates join the outer grid. */}
            <div className="grid grid-cols-2 gap-3 sm:contents">
              <DateField
                id="started-on"
                label="Started"
                value={entry.started_on}
                onSave={(started_on) => save({ started_on })}
              />
              <DateField
                id="finished-on"
                label="Finished"
                value={entry.finished_on}
                onSave={(finished_on) => save({ finished_on })}
              />
            </div>

            {media.type === 'book' && <BookProgressFields entry={entry} onSave={save} />}
            {media.type === 'tv' && <TvProgress entry={entry} onSave={save} />}

            <div className="sm:col-span-2">
              <NotesField value={entry.notes} onSave={(notes) => save({ notes })} />
            </div>
          </fieldset>
        </CardContent>
      </Card>

      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        {media.source !== 'custom' && (
          <>
            <Button
              variant="ghost"
              size="sm"
              className="-ml-2.5"
              onClick={() => refresh.mutate(entry)}
              disabled={offline || refresh.isPending}
            >
              <RefreshCw aria-hidden />
              {refresh.isPending ? 'Refreshing…' : 'Refresh metadata'}
            </Button>
            <span className="text-xs text-muted-foreground">
              Updated{' '}
              {new Date(media.fetched_at).toLocaleDateString(undefined, { dateStyle: 'medium' })}
            </span>
          </>
        )}
        <Button
          variant="ghost"
          size="sm"
          className="ml-auto text-destructive hover:text-destructive"
          onClick={() => setConfirmRemove(true)}
          disabled={offline}
        >
          <Trash2 aria-hidden />
          Remove
        </Button>
      </div>

      <Dialog open={confirmRemove} onOpenChange={setConfirmRemove}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remove {media.title}?</DialogTitle>
            <DialogDescription>
              {media.source === 'custom'
                ? 'This deletes the custom item along with your rating, notes and dates.'
                : 'Your rating, notes and dates for it are deleted. You can add it again from Search.'}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => setConfirmRemove(false)}
              disabled={remove.isPending}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => remove.mutate(entry)}
              disabled={remove.isPending}
            >
              {remove.isPending ? 'Removing…' : 'Remove'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  )
}

/**
 * Saves as soon as the date is complete. A typed year passes through values like
 * 0002 and 0202 on its way to 2026, so years before 1900 count as unfinished.
 */
function DateField({
  id,
  label,
  value,
  onSave,
}: {
  id: string
  label: string
  value: string | null
  onSave: (value: string | null) => void
}) {
  const [draft, setDraft] = useDraft(value ?? '')

  function onChange(event: ChangeEvent<HTMLInputElement>) {
    const next = event.target.value
    setDraft(next)
    if (next === '') {
      if (value !== null) onSave(null)
    } else if (Number(next.slice(0, 4)) >= 1900 && next !== value) {
      onSave(next)
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        type="date"
        value={draft}
        onChange={onChange}
        // Throw away an unfinished date rather than leaving it on screen unsaved.
        onBlur={() => setDraft(value ?? '')}
      />
    </div>
  )
}

function NotesField({ value, onSave }: { value: string; onSave: (value: string) => void }) {
  const [draft, setDraft] = useDraft(value)

  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor="notes">Notes</Label>
      <Textarea
        id="notes"
        rows={5}
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={() => {
          if (draft !== value) onSave(draft)
        }}
      />
    </div>
  )
}

function BookProgressFields({
  entry,
  onSave,
}: {
  entry: EntryWithMedia
  onSave: (patch: EntryPatch) => void
}) {
  const pageCount = pageCountOf(entry.media)
  const savedPages = entry.progress_pages?.toString() ?? ''
  const savedPercent = entry.progress_percent?.toString() ?? ''
  const [pages, setPages] = useDraft(savedPages)
  const [percent, setPercent] = useDraft(savedPercent)

  /** Only the field that was edited drives the save; leaving an untouched field does nothing. */
  function commit(draft: string, saved: string, derive: (value: number | null) => EntryPatch) {
    if (draft === saved) return
    const next = derive(parseWhole(draft))
    if (
      next.progress_pages !== entry.progress_pages ||
      next.progress_percent !== entry.progress_percent
    ) {
      onSave(next)
    } else {
      // Normalised back to what's saved, e.g. "12.0" or an out-of-range value.
      setPages(savedPages)
      setPercent(savedPercent)
    }
  }

  return (
    <fieldset className="flex flex-col gap-2 sm:col-span-2">
      <legend className="mb-2 text-sm leading-none font-medium">Progress</legend>
      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-2">
          <Label htmlFor="progress-pages" className="font-normal text-muted-foreground">
            {pageCount ? `Page (of ${pageCount})` : 'Page'}
          </Label>
          <Input
            id="progress-pages"
            type="number"
            inputMode="numeric"
            min={0}
            max={pageCount ?? undefined}
            value={pages}
            onChange={(event) => setPages(event.target.value)}
            onBlur={() => commit(pages, savedPages, (value) => progressFromPages(value, pageCount))}
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="progress-percent" className="font-normal text-muted-foreground">
            Percent
          </Label>
          <Input
            id="progress-percent"
            type="number"
            inputMode="numeric"
            min={0}
            max={100}
            value={percent}
            onChange={(event) => setPercent(event.target.value)}
            onBlur={() =>
              commit(percent, savedPercent, (value) => progressFromPercent(value, pageCount))
            }
          />
        </div>
      </div>
    </fieldset>
  )
}
