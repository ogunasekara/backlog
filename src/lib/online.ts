import { onlineManager } from '@tanstack/react-query'
import { useSyncExternalStore } from 'react'

/**
 * Whether the device has a connection, as TanStack Query sees it (the browser's
 * online/offline events). Queries pause while it's false; the UI disables writes.
 */
export function useOnline(): boolean {
  return useSyncExternalStore(
    (onChange) => onlineManager.subscribe(onChange),
    () => onlineManager.isOnline(),
  )
}

/** Shown beside controls that are disabled while offline. */
export const OFFLINE_HINT = "You're offline. Changes need a connection."
