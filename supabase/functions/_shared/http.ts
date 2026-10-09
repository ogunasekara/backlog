/** Small fetch helpers shared by the source clients. No Deno-specific APIs. */

export class HttpError extends Error {
  readonly status: number

  constructor(status: number, message: string) {
    super(message)
    this.name = 'HttpError'
    this.status = status
  }
}

export const DEFAULT_TIMEOUT_MS = 8_000

/** Fetch that always rejects rather than hanging, and treats non-2xx as an error. */
export async function fetchJson<T>(
  url: string,
  init: RequestInit = {},
  timeoutMs = DEFAULT_TIMEOUT_MS,
  fetchImpl: typeof fetch = fetch,
): Promise<T> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetchImpl(url, { ...init, signal: controller.signal })
    if (!response.ok) {
      // Upstream error bodies can run to kilobytes of JSON; the message reaches the
      // UI and the logs, so keep only enough of it to diagnose the failure.
      const body = (await response.text().catch(() => '')).replace(/\s+/g, ' ').slice(0, 200)
      throw new HttpError(
        response.status,
        `${response.status} ${response.statusText} ${body}`.trim(),
      )
    }
    return (await response.json()) as T
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw new Error(`Request timed out after ${timeoutMs}ms: ${url}`, { cause: err })
    }
    throw err
  } finally {
    clearTimeout(timer)
  }
}

/** Truncates a blurb on a word boundary so search payloads stay small. */
export function toBlurb(text: string | null | undefined, maxLength = 240): string | undefined {
  const trimmed = text?.trim()
  if (!trimmed) return undefined
  if (trimmed.length <= maxLength) return trimmed
  const cut = trimmed.slice(0, maxLength)
  const lastSpace = cut.lastIndexOf(' ')
  return `${(lastSpace > maxLength * 0.6 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`
}

/** Pulls a 4-digit year out of the various date shapes the sources return. */
export function yearFrom(date: string | null | undefined): number | null {
  const match = date?.match(/\d{4}/)
  if (!match) return null
  const year = Number(match[0])
  return year >= 1000 && year <= 9999 ? year : null
}
