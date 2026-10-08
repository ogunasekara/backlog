import { defineConfig } from 'vitest/config'

// RLS tests run against local Supabase (`pnpm db:start`), not jsdom.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['supabase/tests/**/*.test.ts'],
    globalSetup: ['./supabase/tests/global-setup.ts'],
    testTimeout: 20_000,
    hookTimeout: 30_000,
    fileParallelism: false,
  },
})
