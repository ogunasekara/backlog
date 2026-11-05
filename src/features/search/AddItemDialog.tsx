import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router'
import { CoverImage } from '@/components/CoverImage'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { MEDIA_TYPE_LABELS, statusLabel } from '@/lib/labels'
import { ENTRY_STATUSES, type EntryStatus, type SearchResult } from '@/lib/types'
import { useAddFromSearch } from './useAddEntry'

type Props = {
  result: SearchResult | null
  onClose: () => void
}

export function AddItemDialog({ result, onClose }: Props) {
  const [status, setStatus] = useState<EntryStatus>('backlog')
  const [addToTop, setAddToTop] = useState(false)
  const navigate = useNavigate()
  const add = useAddFromSearch({
    onAdded: onClose,
    // Re-adding something you already have opens the entry you have.
    onDuplicate: (entryId) => {
      onClose()
      if (entryId) void navigate(`/library/${entryId}`)
    },
  })

  function onSubmit(event: FormEvent) {
    event.preventDefault()
    if (!result) return
    add.mutate({ result, status, placement: addToTop ? 'top' : 'bottom' })
  }

  return (
    <Dialog
      open={result !== null}
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add to your library</DialogTitle>
          <DialogDescription>
            {result
              ? `${MEDIA_TYPE_LABELS[result.type]}${result.year ? ` · ${result.year}` : ''}`
              : ''}
          </DialogDescription>
        </DialogHeader>

        {result && (
          <form className="flex flex-col gap-4" onSubmit={onSubmit}>
            <div className="flex gap-4">
              <CoverImage title={result.title} url={result.coverUrl} className="w-20 shrink-0" />
              <div className="min-w-0">
                <p className="font-medium">{result.title}</p>
                {result.blurb && (
                  <p className="mt-1 line-clamp-4 text-sm text-muted-foreground">{result.blurb}</p>
                )}
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="status">Status</Label>
              <Select value={status} onValueChange={(value) => setStatus(value as EntryStatus)}>
                <SelectTrigger id="status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ENTRY_STATUSES.map((value) => (
                    <SelectItem key={value} value={value}>
                      {statusLabel(value, result.type)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {status === 'backlog' && (
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  className="size-4 accent-primary"
                  checked={addToTop}
                  onChange={(event) => setAddToTop(event.target.checked)}
                />
                Add to the top of the backlog
              </label>
            )}

            <DialogFooter>
              <Button type="button" variant="ghost" onClick={onClose} disabled={add.isPending}>
                Cancel
              </Button>
              <Button type="submit" disabled={add.isPending}>
                {add.isPending ? 'Adding…' : 'Add'}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  )
}
