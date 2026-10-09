import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState, type FormEvent } from 'react'
import { toast } from 'sonner'
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { addEntry, createCustomMedia, DuplicateEntryError } from '@/lib/api/entries'
import { entriesKey } from '@/lib/api/keys'
import { MEDIA_TYPE_LABELS, statusLabel } from '@/lib/labels'
import { ENTRY_STATUSES, MEDIA_TYPES, type EntryStatus, type MediaType } from '@/lib/types'

type Props = { open: boolean; onOpenChange: (open: boolean) => void }

const currentYear = new Date().getFullYear()

export function CustomItemDialog({ open, onOpenChange }: Props) {
  const [type, setType] = useState<MediaType>('movie')
  const [title, setTitle] = useState('')
  const [year, setYear] = useState('')
  const [description, setDescription] = useState('')
  const [coverUrl, setCoverUrl] = useState('')
  const [status, setStatus] = useState<EntryStatus>('backlog')
  const queryClient = useQueryClient()

  function reset() {
    setType('movie')
    setTitle('')
    setYear('')
    setDescription('')
    setCoverUrl('')
    setStatus('backlog')
  }

  const create = useMutation({
    mutationFn: async () => {
      const media = await createCustomMedia({
        type,
        title: title.trim(),
        year: year.trim() ? Number(year) : null,
        description: description.trim() || null,
        coverUrl: coverUrl.trim() || null,
      })
      await addEntry({ mediaId: media.id, status })
      return media
    },
    onSuccess: (media) => {
      void queryClient.invalidateQueries({ queryKey: entriesKey })
      toast.success(`Added ${media.title}`)
      reset()
      onOpenChange(false)
    },
    onError: (error) => {
      if (error instanceof DuplicateEntryError) {
        toast.info('Already in your library')
        return
      }
      toast.error(error instanceof Error ? error.message : 'Could not create that item')
    },
  })

  function onSubmit(event: FormEvent) {
    event.preventDefault()
    create.mutate()
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create a custom item</DialogTitle>
          <DialogDescription>
            For anything the four sources don't carry. Only you can see it.
          </DialogDescription>
        </DialogHeader>

        <form className="flex flex-col gap-4" onSubmit={onSubmit}>
          <div className="flex flex-col gap-2">
            <Label htmlFor="custom-title">Title</Label>
            <Input
              id="custom-title"
              required
              value={title}
              onChange={(event) => setTitle(event.target.value)}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-2">
              <Label htmlFor="custom-type">Type</Label>
              <Select value={type} onValueChange={(value) => setType(value as MediaType)}>
                <SelectTrigger id="custom-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MEDIA_TYPES.map((value) => (
                    <SelectItem key={value} value={value}>
                      {MEDIA_TYPE_LABELS[value]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="custom-year">Year</Label>
              <Input
                id="custom-year"
                type="number"
                inputMode="numeric"
                min={1000}
                max={currentYear + 20}
                placeholder="Optional"
                value={year}
                onChange={(event) => setYear(event.target.value)}
              />
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="custom-description">Description</Label>
            <Textarea
              id="custom-description"
              rows={3}
              placeholder="Optional"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
            />
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="custom-cover">Cover URL</Label>
            <Input
              id="custom-cover"
              type="url"
              placeholder="Optional; a placeholder is generated without one"
              value={coverUrl}
              onChange={(event) => setCoverUrl(event.target.value)}
            />
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="custom-status">Status</Label>
            <Select value={status} onValueChange={(value) => setStatus(value as EntryStatus)}>
              <SelectTrigger id="custom-status">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ENTRY_STATUSES.map((value) => (
                  <SelectItem key={value} value={value}>
                    {statusLabel(value, type)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
              disabled={create.isPending}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={create.isPending || !title.trim()}>
              {create.isPending ? 'Creating…' : 'Create'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
