import { defineConfig, devices } from '@playwright/test'
import { localSupabase } from './e2e/support/env'

// Against local Supabase only (`pnpm db:start`). The dev server gets the local URL and
// key from the environment, which outranks any .env file pointing elsewhere.
const supabase = localSupabase()
const port = 5174
const origin = `http://127.0.0.1:${port}`

export default defineConfig({
  testDir: 'e2e',
  // One test user, so the tests run one at a time.
  workers: 1,
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: origin,
    trace: 'retain-on-failure',
  },
  projects: [
    // Signs in through the UI once and saves the session for the other tests: local
    // Supabase rate-limits sign-in emails.
    { name: 'sign-in', testMatch: /auth\.setup\.ts/, use: devices['Desktop Chrome'] },
    {
      name: 'app',
      dependencies: ['sign-in'],
      // Desktop: dnd-kit's keyboard reordering doesn't move under mobile emulation, and
      // touch dragging is checked by hand on a phone anyway.
      use: { ...devices['Desktop Chrome'], storageState: 'e2e/.auth/user.json' },
    },
  ],
  webServer: {
    command: `pnpm exec vite --host 127.0.0.1 --port ${port} --strictPort`,
    url: origin,
    // Playwright first checks whether the server is already up. Under WSL's mirrored
    // networking a closed port times out instead of refusing, so that check takes about
    // two minutes; start the server yourself to skip it (see docs/setup.md).
    reuseExistingServer: !process.env.CI,
    env: {
      VITE_SUPABASE_URL: supabase.url,
      VITE_SUPABASE_ANON_KEY: supabase.anonKey,
    },
  },
})
