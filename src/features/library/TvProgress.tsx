import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Button } from '@/components/ui/button'
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
import { statusLabel } from '@/lib/labels'
import { localToday, type EntryPatch } from '@/lib/status'
import {
  clampPointer,
  formatEpisode,
  isValidPointer,
  pointerOf,
  tvShowOf,
  upcoming,
  type EpisodePointer,
  type Upcoming,
} from '@/lib/tv'
import type { EntryWithMedia } from '@/lib/types'
import { useChangeStatus, useRefreshMetadata } from './useEntryMutations'

type Prompt = 'complete' | 'start' | null

type Props = {
  entry: EntryWithMedia
  onSave: (patch: EntryPatch) => void
}

/** "Nov 5, 2026" for a plain `YYYY-MM-DD`, read as a local date. */
function formatAirDate(date: string): string {
  const [year, month, day] = date.split('-').map(Number)
  return new Date(year!, month! - 1, day!).toLocaleDateString(undefined, { dateStyle: 'medium' })
}

function upcomingText(next: Upcoming, started: boolean): string {
  switch (next.kind) {
    case 'next':
      return `Up next: ${formatEpisode(next.episode)}`
    case 'unaired':
      return next.airDate
        ? `${formatEpisode(next.episode)} airs ${formatAirDate(next.airDate)}`
        : `${formatEpisode(next.episode)} hasn’t aired yet`
    case 'caught_up':
      return started ? 'You’re caught up' : 'No episodes have aired yet'
    case 'finished':
      return 'You’ve watched every episode'
  }
}

export function TvProgress({ entry, onSave }: Props) {
  const { media } = entry
  const show = tvShowOf(media)
  const { counts } = show
  const today = localToday()
  // A refresh can shrink a season under the pointer; show and step from the clamped
  // position, and let the next save write it.
  const pointer = clampPointer(pointerOf(entry), counts)
  const next = upcoming(pointer, show, today)
  const upNext = next.kind === 'next' ? next.episode : null
  const started = pointer.season > 1 || pointer.episode > 0
  const seasonCount = counts?.[pointer.season - 1]

  const { changeStatus } = useChangeStatus()
  const [prompt, setPrompt] = useState<Prompt>(null)
  // Declining "start watching" holds for the rest of the visit, so it doesn't nag every episode.
  const [startDeclined, setStartDeclined] = useState(false)
  const [settingPosition, setSettingPosition] = useState(false)

  useRefreshOnOpen(entry)

  /** The show has ended and this was its last episode. */
  function isFinale(episode: EpisodePointer) {
    return upcoming(episode, show, today).kind === 'finished'
  }

  function moveTo(next: EpisodePointer) {
    onSave({ tv_season: next.season, tv_episode: next.episode })
  }

  function onNext() {
    if (!upNext) return
    moveTo(upNext)
    if (isFinale(upNext) && entry.status !== 'completed') setPrompt('complete')
    else if (entry.status !== 'in_progress' && !startDeclined) setPrompt('start')
  }

  function onSetPosition(position: EpisodePointer) {
    moveTo(position)
    setSettingPosition(false)
    if (isFinale(position) && entry.status !== 'completed') {
      setPrompt('complete')
    }
  }

  function closePrompt() {
    if (prompt === 'start') setStartDeclined(true)
    setPrompt(null)
  }

  return (
    <fieldset className="flex flex-col gap-2 sm:col-span-2">
      <legend className="mb-2 text-sm leading-none font-medium">Progress</legend>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
        <div className="mr-auto flex flex-col gap-0.5">
          <p className="text-lg font-medium tabular-nums" data-testid="tv-position">
            {started ? formatEpisode(pointer) : 'Not started'}
          </p>
          <p className="text-xs text-muted-foreground">
            {upcomingText(next, started)}
            {started && seasonCount !== undefined
              ? ` · ${pointer.episode} of ${seasonCount} in season ${pointer.season}`
              : ''}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setSettingPosition(true)}>
            Set position
          </Button>
          {upNext ? (
            <Button size="sm" onClick={onNext}>
              Next episode
            </Button>
          ) : (
            next.kind === 'finished' &&
            entry.status !== 'completed' && (
              <Button size="sm" onClick={() => setPrompt('complete')}>
                Mark completed
              </Button>
            )
          )}
        </div>
      </div>

      <Dialog open={prompt === 'complete'} onOpenChange={(open) => !open && closePrompt()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>That was the last episode</DialogTitle>
            <DialogDescription>Mark {media.title} as Completed?</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={closePrompt}>
              Not now
            </Button>
            <Button
              onClick={() => {
                changeStatus(entry, 'completed')
                setPrompt(null)
              }}
            >
              Mark completed
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={prompt === 'start'} onOpenChange={(open) => !open && closePrompt()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Started watching?</DialogTitle>
            <DialogDescription>
              {media.title} is set to {statusLabel(entry.status, media.type)}. Move it to Watching?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={closePrompt}>
              Keep as {statusLabel(entry.status, media.type)}
            </Button>
            <Button
              onClick={() => {
                changeStatus(entry, 'in_progress')
                setPrompt(null)
              }}
            >
              Move to Watching
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={settingPosition} onOpenChange={setSettingPosition}>
        <DialogContent>
          {/* Mounted only while open, so the fields start from the current position. */}
          {settingPosition && (
            <SetPositionForm
              pointer={pointer}
              counts={counts}
              onCancel={() => setSettingPosition(false)}
              onSave={onSetPosition}
            />
          )}
        </DialogContent>
      </Dialog>
    </fieldset>
  )
}

/**
 * Opening an in-progress show re-fetches its seasons, so a new season shows up as
 * "up next" without a manual refresh. Once per visit, and only if it was in progress
 * when opened.
 */
function useRefreshOnOpen(entry: EntryWithMedia) {
  const refresh = useRefreshMetadata({ quiet: true })
  const [shouldRefresh] = useState(
    () => entry.status === 'in_progress' && entry.media.source !== 'custom',
  )
  const done = useRef(false)

  useEffect(() => {
    if (!shouldRefresh || done.current) return
    done.current = true
    refresh.mutate(entry)
  }, [shouldRefresh, refresh, entry])
}

function SetPositionForm({
  pointer,
  counts,
  onCancel,
  onSave,
}: {
  pointer: EpisodePointer
  counts: number[] | null
  onCancel: () => void
  onSave: (pointer: EpisodePointer) => void
}) {
  const [season, setSeason] = useState(String(pointer.season))
  const [episode, setEpisode] = useState(String(pointer.episode))
  const [error, setError] = useState<string | null>(null)

  const seasonNumber = Number(season)
  const seasonLength =
    counts && Number.isInteger(seasonNumber) ? counts[seasonNumber - 1] : undefined

  function submit(event: FormEvent) {
    event.preventDefault()
    const next = { season: Number(season), episode: Number(episode) }
    if (season.trim() === '' || episode.trim() === '' || !isValidPointer(next, counts)) {
      setError(
        counts
          ? `Choose a season from 1 to ${counts.length} and an episode within it.`
          : 'Choose a season of 1 or more and an episode of 0 or more.',
      )
      return
    }
    onSave(next)
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
      <DialogHeader>
        <DialogTitle>Set position</DialogTitle>
        <DialogDescription>
          The last episode you watched. Episode 0 means you haven’t started that season.
        </DialogDescription>
      </DialogHeader>
      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-2">
          <Label htmlFor="tv-season">{counts ? `Season (of ${counts.length})` : 'Season'}</Label>
          <Input
            id="tv-season"
            type="number"
            inputMode="numeric"
            min={1}
            max={counts?.length}
            value={season}
            onChange={(event) => setSeason(event.target.value)}
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="tv-episode">
            {seasonLength !== undefined ? `Episode (of ${seasonLength})` : 'Episode'}
          </Label>
          <Input
            id="tv-episode"
            type="number"
            inputMode="numeric"
            min={0}
            max={seasonLength}
            value={episode}
            onChange={(event) => setEpisode(event.target.value)}
          />
        </div>
      </div>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <DialogFooter>
        <Button type="button" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit">Save</Button>
      </DialogFooter>
    </form>
  )
}
