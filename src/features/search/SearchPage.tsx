import { useQuery } from '@tanstack/react-query'
import { Plus, Search as SearchIcon } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { useSearchParams } from 'react-router'
import { CoverImage } from '@/components/CoverImage'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
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
import { searchKey } from '@/lib/api/keys'
import { searchMedia } from '@/lib/api/search'
import { MEDIA_TYPE_LABELS, SCOPE_LABELS } from '@/lib/labels'
import { useOnline } from '@/lib/online'
import type { SearchResult, SearchScope } from '@/lib/types'
import { AddItemDialog } from './AddItemDialog'
import { CustomItemDialog } from './CustomItemDialog'

const SCOPES: SearchScope[] = ['all', 'movie', 'tv', 'book', 'game']

function isScope(value: string | null): value is SearchScope {
  return value !== null && (SCOPES as string[]).includes(value)
}

export function SearchPage() {
  // The scope comes from the URL so the library tabs can link here already scoped.
  const [searchParams, setSearchParams] = useSearchParams()
  const scopeParam = searchParams.get('type')
  const scope: SearchScope = isScope(scopeParam) ? scopeParam : 'all'

  const [draft, setDraft] = useState('')
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState<SearchResult | null>(null)
  const [customOpen, setCustomOpen] = useState(false)
  const online = useOnline()

  const search = useQuery({
    queryKey: searchKey(scope, query),
    queryFn: () => searchMedia(scope, query),
    enabled: query.length > 0,
    staleTime: 5 * 60 * 1000,
    retry: false,
  })

  function onSubmit(event: FormEvent) {
    event.preventDefault()
    setQuery(draft.trim())
  }

  function onScopeChange(next: string) {
    setSearchParams(
      (params) => {
        if (next === 'all') params.delete('type')
        else params.set('type', next)
        return params
      },
      { replace: true },
    )
  }

  return (
    <section className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">Search</h1>
        <Button variant="outline" onClick={() => setCustomOpen(true)} disabled={!online}>
          <Plus className="size-4" aria-hidden />
          Custom item
        </Button>
      </div>

      <form className="flex flex-col gap-3 sm:flex-row sm:items-end" onSubmit={onSubmit}>
        <div className="flex flex-col gap-2 sm:w-40">
          <Label htmlFor="scope">Type</Label>
          <Select value={scope} onValueChange={onScopeChange}>
            <SelectTrigger id="scope" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SCOPES.map((value) => (
                <SelectItem key={value} value={value}>
                  {SCOPE_LABELS[value]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-1 flex-col gap-2">
          <Label htmlFor="query">Search</Label>
          <Input
            id="query"
            type="search"
            placeholder="Search movies, shows, books and games"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
          />
        </div>

        <Button type="submit" disabled={!online || !draft.trim() || search.isFetching}>
          <SearchIcon className="size-4" aria-hidden />
          {search.isFetching ? 'Searching…' : 'Search'}
        </Button>
      </form>

      {!online && (
        <p role="status" className="text-sm text-muted-foreground">
          Searching and adding need a connection.
        </p>
      )}

      {search.isFetching && <ResultSkeletons />}

      {search.isError && (
        <p role="alert" className="text-sm text-destructive">
          {search.error instanceof Error ? search.error.message : 'Search failed'}
        </p>
      )}

      {search.data?.errors?.map((sourceError) => (
        <p
          key={`${sourceError.source}-${sourceError.type}`}
          role="status"
          className="text-sm text-muted-foreground"
        >
          {MEDIA_TYPE_LABELS[sourceError.type]} results are unavailable right now (
          {sourceError.message})
        </p>
      ))}

      {!search.isFetching && search.data?.results.length === 0 && (
        <p className="text-sm text-muted-foreground">
          Nothing found for “{query}”. Try a different title, or create a custom item.
        </p>
      )}

      {!search.isFetching && (search.data?.results.length ?? 0) > 0 && (
        <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {search.data?.results.map((result) => (
            <li key={`${result.source}-${result.type}-${result.externalId}`}>
              <ResultCard result={result} onAdd={() => setSelected(result)} disabled={!online} />
            </li>
          ))}
        </ul>
      )}

      <AddItemDialog result={selected} onClose={() => setSelected(null)} />
      <CustomItemDialog open={customOpen} onOpenChange={setCustomOpen} />
    </section>
  )
}

function ResultCard({
  result,
  onAdd,
  disabled,
}: {
  result: SearchResult
  onAdd: () => void
  disabled: boolean
}) {
  return (
    <div className="flex h-full flex-col gap-2">
      <CoverImage title={result.title} url={result.coverUrl} />
      <div className="flex flex-1 flex-col gap-1">
        <div className="flex items-start justify-between gap-2">
          <p className="text-sm leading-snug font-medium">{result.title}</p>
          <Badge variant="secondary" className="shrink-0">
            {MEDIA_TYPE_LABELS[result.type]}
          </Badge>
        </div>
        {result.year && <p className="text-xs text-muted-foreground">{result.year}</p>}
      </div>
      <Button size="sm" variant="secondary" onClick={onAdd} disabled={disabled}>
        Add
      </Button>
    </div>
  )
}

function ResultSkeletons() {
  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
      {Array.from({ length: 10 }, (_, i) => (
        <div key={i} className="flex flex-col gap-2">
          <Skeleton className="aspect-[2/3] w-full rounded-md" />
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-8 w-full" />
        </div>
      ))}
    </div>
  )
}
