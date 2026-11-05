import { execSync } from 'node:child_process'
import path from 'node:path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import { defineConfig } from 'vitest/config'

function git(args: string): string | undefined {
  try {
    return execSync(`git ${args}`, { stdio: ['ignore', 'pipe', 'ignore'] })
      .toString()
      .trim()
  } catch {
    return undefined
  }
}

// The Android release sets APP_VERSION from its tag. The web deploys `main`, so it shows
// the nearest tag plus commits since (e.g. v0.6.0-3-gabc1234), or just the commit when
// the checkout has no tags.
const commit = git('rev-parse --short HEAD') ?? 'unknown'
const version = process.env.APP_VERSION ?? git('describe --tags --always') ?? 'dev'

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      // main.tsx registers it (web only) and offers the update with a toast.
      injectRegister: false,
      registerType: 'prompt',
      // Icons, favicon and apple-touch-icon are generated at build time; see
      // pwa-assets.config.ts. index.html sets light and dark theme colors itself.
      pwaAssets: { config: true, overrideManifestIcons: true, injectThemeColor: false },
      manifest: {
        name: 'Backlog',
        short_name: 'Backlog',
        description: 'Track the movies, shows, books and games on your list.',
        start_url: '/library',
        display: 'standalone',
        background_color: '#0a0a0a',
        theme_color: '#0a0a0a',
      },
      workbox: {
        // The app shell: every built asset, with index.html for any route.
        // The plugin adds the manifest itself; listing it here too makes two entries
        // with different revisions, which fails the install and leaves the cache empty.
        globPatterns: ['**/*.{js,css,html,svg,png,ico}'],
        navigateFallback: 'index.html',
      },
    }),
  ],
  define: {
    __APP_VERSION__: JSON.stringify(version),
    __APP_COMMIT__: JSON.stringify(commit),
  },
  // Fixed port: Supabase only allows auth redirects back to localhost:5173.
  server: { port: 5173, strictPort: true },
  resolve: {
    alias: { '@': path.resolve(import.meta.dirname, './src') },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    // Fixed dummy values so tests never depend on a developer's .env.local and
    // never reach a real backend; every API module is mocked in tests anyway.
    env: {
      VITE_SUPABASE_URL: 'http://127.0.0.1:54321',
      VITE_SUPABASE_ANON_KEY: 'test-anon-key',
    },
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}', 'supabase/functions/**/*.test.ts'],
  },
})
