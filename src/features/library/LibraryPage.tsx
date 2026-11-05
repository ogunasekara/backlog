import { useQuery } from '@tanstack/react-query'
import { Plus } from 'lucide-react'
import { Link, useSearchParams } from 'react-router'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { listEntries } from '@/lib/api/entries'
import { compareBacklog } from '@/lib/backlog'
import { entriesKey } from '@/lib/api/keys'
import { SCOPE_LABELS, statusLabel } from '@/lib/labels'
import { ENTRY_STATUSES, type SearchScope } from '@/lib/types'
import { BacklogList } from './BacklogList'
import { EntryRow } from './EntryRow'
import {
  applyLibraryView,
  defaultSort,
  parseLibraryView,
  SORT_LABELS,
  sortsFor,
  type LibraryView,
} from './filters'

const TABS: SearchScope[] = ['all', 'movie', 'tv', 'book', 'game']
const ALL_STATUSES = 'any'

export function LibraryPage() {
  const entries = useQuery({ queryKey: entriesKey, queryFn: listEntries })

  // The view lives in the URL, so returning from an entry keeps the tab and filters.
  const [searchParams, setSearchParams] = useSearchParams()
  const view = parseLibraryView(searchParams)
  const tab: SearchScope = view.type ?? 'all'

  function setParam(name: keyof LibraryView, value: string | null) {
    setSearchParams(
      (params) => {
        if (value === null) params.delete(name)
        else params.set(name, value)
        return params
      },
      { replace: true },
    )
  }

  const visible = entries.data ? applyLibraryView(entries.data, view) : []
  const searchLink = view.type ? `/search?type=${view.type}` : '/search'
  // Dragging only makes sense when the list shows the backlog in its own order.
  const reorderable = view.status === 'backlog' && view.sort === 'position'
  const backlog = reorderable
    ? (entries.data ?? []).filter(({ status }) => status === 'backlog').sort(compareBacklog)
    : []

  return (
    <section className="flex flex-col gap-6 pb-16">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">Library</h1>
        {/* Floats bottom right, above the tab bar on mobile, so it's always within reach.
            The section's bottom padding keeps it off the last row. */}
        <Button
          asChild
          className="fixed right-4 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-10 h-12 rounded-full shadow-lg has-[>svg]:px-5 md:right-8 md:bottom-8"
        >
          <Link to={searchLink}>
            <Plus className="size-4" aria-hidden />
            Add
          </Link>
        </Button>
      </div>

      <Tabs value={tab} onValueChange={(next) => setParam('type', next === 'all' ? null : next)}>
        <TabsList className="w-full sm:w-fit">
          {TABS.map((value) => (
            <TabsTrigger key={value} value={value}>
              {SCOPE_LABELS[value]}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value={tab} className="flex flex-col gap-4 pt-2">
          <div className="grid grid-cols-2 gap-3 sm:flex sm:items-end">
            <div className="flex flex-col gap-2 sm:w-44">
              <Label htmlFor="status-filter">Status</Label>
              <Select
                value={view.status ?? ALL_STATUSES}
                onValueChange={(next) => setParam('status', next === ALL_STATUSES ? null : next)}
              >
                <SelectTrigger id="status-filter" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL_STATUSES}>Any status</SelectItem>
                  {ENTRY_STATUSES.map((value) => (
                    <SelectItem key={value} value={value}>
                      {statusLabel(value, view.type ?? undefined)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-col gap-2 sm:w-44">
              <Label htmlFor="sort">Sort by</Label>
              <Select
                value={view.sort}
                onValueChange={(next) =>
                  setParam('sort', next === defaultSort(view.status) ? null : next)
                }
              >
                <SelectTrigger id="sort" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {sortsFor(view.status).map((value) => (
                    <SelectItem key={value} value={value}>
                      {SORT_LABELS[value]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {entries.isPending && (
            <div className="flex flex-col gap-3">
              {Array.from({ length: 4 }, (_, i) => (
                <Skeleton key={i} className="h-20 w-full" />
              ))}
            </div>
          )}

          {entries.isError && (
            <p role="alert" className="text-sm text-destructive">
              {entries.error instanceof Error
                ? entries.error.message
                : 'Could not load your library'}
            </p>
          )}

          {entries.data?.length === 0 && (
            <div className="flex flex-col items-start gap-3">
              <p className="text-muted-foreground">Your library is empty.</p>
              <Button asChild>
                <Link to={searchLink}>Find something to add</Link>
              </Button>
            </div>
          )}

          {(entries.data?.length ?? 0) > 0 && visible.length === 0 && (
            <p className="text-muted-foreground">Nothing here matches these filters.</p>
          )}

          {visible.length > 0 && reorderable && (
            <>
              <p className="-mt-1 text-sm text-muted-foreground">Drag the handle to reorder.</p>
              <BacklogList backlog={backlog} type={view.type} />
            </>
          )}

          {visible.length > 0 && !reorderable && (
            <ul className="flex flex-col gap-3">
              {visible.map((entry) => (
                <li key={entry.id}>
                  <EntryRow entry={entry} />
                </li>
              ))}
            </ul>
          )}
        </TabsContent>
      </Tabs>
    </section>
  )
}
