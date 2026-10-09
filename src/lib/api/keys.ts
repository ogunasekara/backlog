/** TanStack Query keys, kept in one place so mutations can invalidate reliably. */
export const entriesKey = ['entries'] as const
export const searchKey = (scope: string, query: string) => ['search', scope, query] as const
