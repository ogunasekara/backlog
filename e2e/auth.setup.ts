import { expect, test as setup } from '@playwright/test'
import { allowListTestUser, E2E_EMAIL, readSignInCode } from './support/backend'

setup('sign in with an emailed code', async ({ page }) => {
  await allowListTestUser()
  await page.goto('/')

  const sentAt = new Date(Date.now() - 1000)
  await page.getByLabel('Email').fill(E2E_EMAIL)
  await page.getByRole('button', { name: 'Email me a sign-in code' }).click()
  await expect(page.getByRole('status')).toContainText(E2E_EMAIL)

  await page.getByLabel('Code').fill(await readSignInCode(E2E_EMAIL, sentAt))
  await page.getByRole('button', { name: 'Sign in' }).click()

  await expect(page.getByRole('heading', { name: 'Library' })).toBeVisible()
  await page.context().storageState({ path: 'e2e/.auth/user.json' })
})
