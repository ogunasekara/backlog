import { expect, test, type Page } from '@playwright/test'
import { addEntry, clearLibrary, upsertCatalogMedia } from './support/backend'
import { localSupabase } from './support/env'
import { mockMetadataFunctions } from './support/functions'

test.beforeEach(async () => {
  await clearLibrary()
})

test('search and add', async ({ page }) => {
  await mockMetadataFunctions(page, [
    { type: 'movie', source: 'tmdb', externalId: 'e2e-arrival', title: 'Arrival', year: 2016 },
  ])

  await page.goto('/search')
  await page.getByLabel('Search', { exact: true }).fill('arrival')
  await page.getByRole('button', { name: 'Search' }).click()
  await page.getByRole('button', { name: 'Add' }).click()

  const dialog = page.getByRole('dialog', { name: 'Add to your library' })
  await dialog.getByRole('button', { name: 'Add' }).click()
  await expect(dialog).toBeHidden()

  await page.getByRole('link', { name: 'Library' }).click()
  await expect(page.getByRole('link', { name: /Arrival/ })).toBeVisible()
})

test('reorder the backlog', async ({ page }) => {
  for (const [title, position] of [
    ['First', 'a1'],
    ['Second', 'a2'],
    ['Third', 'a3'],
  ] as const) {
    await addEntry(await upsertCatalogMedia({ type: 'movie', title }), {
      backlog_position: position,
    })
  }

  await page.goto('/library?status=backlog')
  const titles = page.getByRole('main').getByRole('list').getByRole('link')
  await expect(titles).toHaveCount(3)
  await expect(titles.nth(0)).toContainText('First')

  // Keyboard drag: pick up, move down one, drop. Each key waits for the last to take
  // effect (the handle shows as pressed while held; dnd-kit announces each move).
  const handle = page.getByRole('button', { name: 'Reorder First' })
  await handle.focus()
  await page.keyboard.press('Space')
  await expect(handle).toHaveAttribute('aria-pressed', 'true')
  await page.keyboard.press('ArrowDown')
  await expect(page.getByText('First moved to position 2 of 3.')).toBeAttached()
  await page.keyboard.press('Space')

  const order = async () =>
    (await titles.allTextContents()).map((text) => text.match(/First|Second|Third/)?.[0])
  await expect.poll(order).toEqual(['Second', 'First', 'Third'])

  await page.reload()
  await expect(titles).toHaveCount(3)
  await expect.poll(order).toEqual(['Second', 'First', 'Third'])
})

test('mark TV progress through to completed', async ({ page }) => {
  await mockMetadataFunctions(page, [])
  const show = await upsertCatalogMedia({
    type: 'tv',
    title: 'Two Seasons',
    details: { season_episode_counts: [1, 1] },
  })
  await addEntry(show)

  await page.goto('/library')
  await page.getByRole('link', { name: /Two Seasons/ }).click()

  await page.getByRole('button', { name: 'Next episode' }).click()
  await page.getByRole('button', { name: 'Move to Watching' }).click()
  await expect(page.getByTestId('tv-position')).toHaveText('S1 E1')
  await expect(page.getByLabel('Status')).toContainText('Watching')

  await page.getByRole('button', { name: 'Next episode' }).click()
  await expect(page.getByTestId('tv-position')).toHaveText('S2 E1')
  await page.getByRole('button', { name: 'Mark completed' }).click()
  await expect(page.getByLabel('Status')).toContainText('Completed')

  await page.reload()
  await expect(page.getByTestId('tv-position')).toHaveText('S2 E1')
  await expect(page.getByLabel('Status')).toContainText('Completed')
})

test('opens the saved library when the server is unreachable, read-only', async ({
  page,
  context,
}) => {
  await addEntry(await upsertCatalogMedia({ type: 'book', title: 'Offline Reading' }))

  await page.goto('/library')
  await expect(page.getByRole('link', { name: /Offline Reading/ })).toBeVisible()
  // The cache is written to IndexedDB at most once a second, and the first write can
  // come before the library has loaded.
  await expect.poll(() => savedCache(page)).toContain('Offline Reading')

  // Supabase down: the reload shows the library from IndexedDB.
  await context.route(`${localSupabase().url}/**`, (route) => route.abort())
  await page.reload()
  await expect(page.getByRole('link', { name: /Offline Reading/ })).toBeVisible()

  // No connection at all: read-only.
  await context.setOffline(true)
  await expect(page.getByText('Offline, read-only')).toBeVisible()
  await page.getByRole('link', { name: /Offline Reading/ }).click()
  await expect(page.getByRole('heading', { name: 'Offline Reading' })).toBeVisible()
  await expect(page.getByLabel('Notes')).toBeDisabled()
  await expect(page.getByRole('button', { name: 'Remove' })).toBeDisabled()
  await context.setOffline(false)
})

/** The saved query cache, as the persister serialized it, or '' if there isn't one. */
function savedCache(page: Page) {
  return page.evaluate(
    () =>
      new Promise<string>((resolve) => {
        const open = indexedDB.open('keyval-store')
        open.onerror = () => resolve('')
        open.onsuccess = () => {
          const db = open.result
          if (!db.objectStoreNames.contains('keyval')) return resolve('')
          const get = db.transaction('keyval').objectStore('keyval').get('backlog-query-cache')
          get.onsuccess = () => resolve(typeof get.result === 'string' ? get.result : '')
          get.onerror = () => resolve('')
        }
      }),
  )
}
