import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type Announcements,
  type DragEndEvent,
  type UniqueIdentifier,
} from '@dnd-kit/core'
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { GripVertical } from 'lucide-react'
import { useState } from 'react'
import { compareBacklog, type PositionUpdate } from '@/lib/backlog'
import type { EntryWithMedia, MediaType } from '@/lib/types'
import { cn } from '@/lib/utils'
import { EntryRow } from './EntryRow'
import { useMoveInBacklog } from './useEntryMutations'

const INSTRUCTIONS =
  'To reorder, press space or enter on the handle, move with the arrow keys, then press space or enter to drop. Press escape to cancel.'

/**
 * The backlog in order, reordered by dragging a row's handle. In a type tab only that
 * type is shown, and a drag reshuffles it within the slots it already holds, so other
 * types never move (see `reorderWithin`).
 */
export function BacklogList({
  backlog: incoming,
  type,
}: {
  /** The whole backlog, every type. */
  backlog: EntryWithMedia[]
  type: MediaType | null
}) {
  const { moveTo } = useMoveInBacklog()

  // The optimistic cache update reaches this list a tick after the drop (TanStack
  // notifies on a timeout). dnd-kit clears the drag offsets at once, so without a
  // local copy of the drop the row snaps back to its old slot for a frame, then jumps.
  // The local copy holds until the list changes (the cache has the move) or the save
  // fails. A failure can't rely on the list changing: the optimistic update and its
  // rollback can both land before this list is notified, so it never sees a change.
  const signature = incoming.map((entry) => `${entry.id}:${entry.backlog_position}`).join()
  const [dropped, setDropped] = useState<{ updates: PositionUpdate[]; basis: string } | null>(null)
  if (dropped && dropped.basis !== signature) setDropped(null)
  const backlog = (() => {
    if (!dropped || dropped.basis !== signature) return incoming
    const fresh = new Map(dropped.updates.map(({ id, position }) => [id, position]))
    return incoming
      .map((entry) =>
        fresh.has(entry.id) ? { ...entry, backlog_position: fresh.get(entry.id)! } : entry,
      )
      .sort(compareBacklog)
  })()
  const entries = type ? backlog.filter((entry) => entry.media.type === type) : backlog

  const sensors = useSensors(
    useSensor(MouseSensor),
    // The handle is touch-action: none, so a short hold is enough to tell a drag from a tap.
    useSensor(TouchSensor, { activationConstraint: { delay: 120, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  const ids = entries.map((entry) => entry.id)
  const titleOf = (id: UniqueIdentifier) =>
    entries.find((entry) => entry.id === id)?.media.title ?? 'Item'
  const positionOf = (id: UniqueIdentifier) =>
    `position ${ids.indexOf(String(id)) + 1} of ${ids.length}`

  const announcements: Announcements = {
    onDragStart: ({ active }) => `Picked up ${titleOf(active.id)} at ${positionOf(active.id)}.`,
    onDragOver: ({ active, over }) =>
      over
        ? `${titleOf(active.id)} moved to ${positionOf(over.id)}.`
        : `${titleOf(active.id)} is outside the list.`,
    onDragEnd: ({ active, over }) =>
      over
        ? `${titleOf(active.id)} dropped at ${positionOf(over.id)}.`
        : `${titleOf(active.id)} dropped back where it was.`,
    onDragCancel: ({ active }) =>
      `Reordering cancelled. ${titleOf(active.id)} is back at ${positionOf(active.id)}.`,
  }

  function onDragEnd({ active, over }: DragEndEvent) {
    if (!over || active.id === over.id) return
    const updates = moveTo(backlog, ids, String(active.id), ids.indexOf(String(over.id)), {
      onError: () => setDropped(null),
    })
    setDropped({ updates, basis: signature })
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={onDragEnd}
      accessibility={{ announcements, screenReaderInstructions: { draggable: INSTRUCTIONS } }}
    >
      <SortableContext items={ids} strategy={verticalListSortingStrategy}>
        <ul className="flex flex-col gap-3">
          {entries.map((entry) => (
            <SortableRow key={entry.id} entry={entry} />
          ))}
        </ul>
      </SortableContext>
    </DndContext>
  )
}

function SortableRow({ entry }: { entry: EntryWithMedia }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: entry.id })

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={cn('relative rounded-lg', isDragging && 'z-10 shadow-lg')}
    >
      <EntryRow
        entry={entry}
        hideStatus
        handle={
          <button
            type="button"
            ref={setActivatorNodeRef}
            {...attributes}
            {...listeners}
            aria-label={`Reorder ${entry.media.title}`}
            className="ml-1 flex h-12 w-8 shrink-0 cursor-grab touch-none items-center justify-center rounded-md text-muted-foreground hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none active:cursor-grabbing"
          >
            <GripVertical className="size-5" aria-hidden />
          </button>
        }
      />
    </li>
  )
}
