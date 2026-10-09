/** Fan-out and result merging for the `search` function. Pure; the tasks are injected. */
import type {
  CatalogSource,
  MediaType,
  SearchResponse,
  SearchResult,
  SourceError,
} from './types.ts'

export type SearchTask = {
  type: MediaType
  source: CatalogSource
  run: () => Promise<SearchResult[]>
}

function errorMessage(reason: unknown): string {
  return reason instanceof Error ? reason.message : String(reason)
}

/**
 * Takes one result from each group in turn, so a multi-type search shows a mix
 * near the top instead of every movie before the first book.
 */
export function interleave(groups: SearchResult[][]): SearchResult[] {
  const merged: SearchResult[] = []
  const longest = Math.max(0, ...groups.map((group) => group.length))
  for (let i = 0; i < longest; i++) {
    for (const group of groups) {
      if (i < group.length) merged.push(group[i])
    }
  }
  return merged
}

/**
 * Runs every task in parallel. A source that fails or times out is reported in
 * `errors` and the results from the others are still returned.
 */
export async function runSearchTasks(tasks: SearchTask[]): Promise<SearchResponse> {
  // The async wrapper matters: a task that throws synchronously (a missing API key,
  // say) would otherwise escape allSettled and reject the whole fan-out.
  const settled = await Promise.allSettled(tasks.map(async (task) => task.run()))

  const groups: SearchResult[][] = []
  const errors: SourceError[] = []

  settled.forEach((outcome, i) => {
    const { source, type } = tasks[i]
    if (outcome.status === 'fulfilled') {
      groups.push(outcome.value)
    } else {
      errors.push({ source, type, message: errorMessage(outcome.reason) })
    }
  })

  const response: SearchResponse = { results: interleave(groups) }
  if (errors.length > 0) response.errors = errors
  return response
}
