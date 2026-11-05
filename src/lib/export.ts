import { Capacitor } from '@capacitor/core'
import type { Entry, EntryWithMedia, Media } from '@/lib/types'

export type BacklogExport = {
  format: 'backlog-export'
  /** Bumped if the shape below changes. */
  formatVersion: 1
  exportedAt: string
  appVersion: string
  /** Every entry, with `media_id` pointing into `media`. */
  entries: Entry[]
  /** Each media item once, custom items included. */
  media: Media[]
}

/** Splits the library into entries and the media they point to, each media row once. */
export function buildExport(
  library: EntryWithMedia[],
  { now = new Date(), appVersion = __APP_VERSION__ } = {},
): BacklogExport {
  const media = new Map<string, Media>()
  const entries = library.map(({ media: item, ...entry }) => {
    media.set(item.id, item)
    return entry
  })
  return {
    format: 'backlog-export',
    formatVersion: 1,
    exportedAt: now.toISOString(),
    appVersion,
    entries,
    media: [...media.values()],
  }
}

/** e.g. backlog-export-2026-11-05.json, in local time. */
export function exportFileName(now = new Date()) {
  const pad = (n: number) => String(n).padStart(2, '0')
  const day = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
  return `backlog-export-${day}.json`
}

/**
 * Saves the export. The web downloads it. The Android WebView ignores download links,
 * so the app writes it to its cache and opens the share sheet, from which it can go to
 * Files, Drive or anywhere else.
 */
export async function saveExport(data: BacklogExport, fileName = exportFileName()) {
  const json = JSON.stringify(data, null, 2)

  if (Capacitor.isNativePlatform()) {
    const [{ Directory, Encoding, Filesystem }, { Share }] = await Promise.all([
      import('@capacitor/filesystem'),
      import('@capacitor/share'),
    ])
    const { uri } = await Filesystem.writeFile({
      path: fileName,
      data: json,
      directory: Directory.Cache,
      encoding: Encoding.UTF8,
    })
    try {
      await Share.share({ title: fileName, files: [uri] })
    } catch (err) {
      // Closing the share sheet without picking anything isn't a failure.
      if (err instanceof Error && /cancel/i.test(err.message)) return
      throw err
    }
    return
  }

  const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }))
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  link.click()
  // Revoked on the next tick: some browsers start the download after click() returns.
  setTimeout(() => URL.revokeObjectURL(url), 0)
}
