# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Backlog is a personal tracker for movies, TV, books and games, restricted to an email allow-list. One React codebase ships as a PWA (Cloudflare Worker with static assets, although older docs say "Pages") and as a sideloaded Android APK (Capacitor). The backend is Supabase: Postgres with RLS, plus two edge functions.

v1 is complete. `docs/implementation-plan.md` holds the data model, core rules and what is out of scope. `docs/PROGRESS.md` records per-phase decisions and the bugs behind non-obvious code, so check it before changing behaviour that looks odd, and update it as work lands. `docs/setup.md` covers hosted setup and manual exit checks.

## Commands

Node 22+, pnpm 10. Docker is needed for anything touching local Supabase.

```sh
pnpm install
pnpm db:start                # local Supabase; prints the keys
cp .env.example .env.local   # paste ANON_KEY
pnpm dev                     # always port 5173 (strictPort; auth redirects depend on it)
pnpm functions:serve         # optional second terminal; needs supabase/functions/.env
```

CI runs `lint`, `format:check`, `typecheck`, `test`, `build`, `test:rls` and `test:e2e`. Pull requests skip `test:e2e`, which runs only on pushes to `main`.

```sh
pnpm lint
pnpm format:check            # `pnpm format` to fix
pnpm typecheck               # app, node configs, functions/_shared and e2e
pnpm test                    # Vitest: src/ and supabase/functions/
pnpm test:rls                # supabase/tests/; needs db:start
pnpm test:e2e                # Playwright; needs db:start and `pnpm exec playwright install chromium`
pnpm db:reset                # reapply migrations and seeds locally

pnpm exec vitest run src/lib/tv.test.ts                 # one file
pnpm exec vitest run src/lib/status.test.ts -t "name"   # tests matching a name
pnpm exec vitest run --config vitest.rls.config.ts -t "name"
pnpm exec playwright test -g "name"
```

Sign-in emails go to Mailpit locally (http://127.0.0.1:54324). Add your own allow-listed email through `supabase/seed.local.sql` (gitignored, see the `.example`), then `pnpm db:reset`.

Under WSL with mirrored networking, Playwright's server check stalls for about two minutes. Starting the server first avoids it; the command is in `docs/setup.md`.

## Architecture

### Data flow

- `src/features/*` holds screens and their hooks. `src/lib` holds pure domain logic (`status`, `backlog`, `tv`, `progress`, `rating`) with its unit tests. `src/lib/api` is the only layer that talks to Supabase. `src/components/ui` is shadcn/ui.
- **The whole library is one TanStack query** (`entriesKey`, `entries` joined with `media`). Filtering and sorting are client-side, and the entry screen reads from that cached list rather than its own query, so there is one cache for optimistic updates to patch.
- Library views and search scope live in the URL.

### Writes

Writes in `src/features/library/useEntryMutations.ts` patch the cached list in `onMutate`, roll back with a toast in `onError`, and share a mutation key so only the last edit to settle refetches (otherwise a refetch briefly undoes another in-flight edit). New entry edits should follow this pattern.

There are no offline writes. The UI disables write controls while offline, and mutations use `networkMode: 'always'` so one that slips through fails at once instead of pausing with its optimistic value on screen.

### Data rules enforced across layers

- `backlog_position` must be non-null exactly when `status = 'backlog'` (check constraint). Route status changes through `statusTransition` in `src/lib/status.ts`, which also handles the date auto-fill rules. Completing never invents a start date.
- Backlog order is a fractional index on a `collate "C"` column, and JS must compare keys by code unit to agree with Postgres; never use `localeCompare` on them. Sort with `compareBacklog`.
- `reorderWithin` in `src/lib/backlog.ts` keeps a type tab's entries inside the global slots they already hold, so other types never move. A move in All writes one row; several rows go through the `set_backlog_positions` RPC so a reorder can't half-apply.
- Moving within the backlog deliberately doesn't bump `updated_at` (see the trigger in the latest migration).
- The TV pointer is the last episode watched, starting at S1E0. Invalid pointers are clamped on read, never written back. Only aired episodes are offered, and the Completed prompt needs an ended show (`src/lib/tv.ts`).

### Database and auth

- `media` is a shared catalog. Catalog rows are written only by the `details` function with the service role; clients may only write `source = 'custom'` rows they own. `entries` is owner-only, and `anon` can read no table.
- Sign-up is gated by the `hook_before_user_created` Postgres function against `allowed_emails`. Admin-created users bypass it.
- Schema changes are new files in `supabase/migrations/`, with cases added to `supabase/tests/rls.test.ts`.

### Edge functions

`search` and `details` are thin Deno entrypoints that read `Deno.env` and pass keys into `supabase/functions/_shared`. The split matters: entrypoints are excluded from `tsc` and from unit tests (Deno globals, `npm:` specifiers), so check them by running `pnpm functions:serve`. `_shared` must stay free of Deno globals because it is typechecked and tested under Node, and its imports use explicit `.ts` extensions. Each source has a normalizer tested against `__fixtures__`. `search` fans out with per-source failures reported in `errors`, so one bad source never fails the request.

### Offline and platform differences

- Only the library is persisted to IndexedDB (`src/lib/query-client.ts`), and it is cleared on sign-out. Bump `CACHE_SCHEMA` when the cached shape changes. Keep `gcTime: Infinity` on the library: a 30-day value overflows `setTimeout` and evicts it immediately.
- The service worker is web-only (`src/main.tsx`). The APK bundles its assets, and a worker could pin an old build.
- `AuthProvider` falls back to the stored session when an expired token can't be refreshed offline. Native Google sign-in uses a lazily loaded plugin and `signInWithIdToken`; the web uses a redirect. Email sign-in is a 6-digit code, never a link, because links would open the website rather than the app.
- Don't add a `_redirects` SPA rule. The fallback is in `wrangler.jsonc`, and Workers reject the rule as an infinite loop.

## Testing

- Unit and component tests mock the API modules and never reach a backend; `vite.config.ts` supplies dummy env values. Use `renderWithProviders` from `src/test/render.tsx`, with a pre-filled `queryClient` for cached-library cases.
- RLS tests run against real local Supabase and take connection details from `supabase status`.
- E2E tests use one user (`e2e-user@example.com`), run serially in desktop Chrome, stub the edge functions, and wipe that user's library before each test.
- Touch dragging and native sign-in can only be checked by hand on a phone.

## Releasing

Each target ships separately, and order matters:

1. Migrations first: `pnpm exec supabase db push`.
2. `pnpm functions:deploy` if anything under `supabase/functions` changed.
3. Merging to `main` deploys the web app through Cloudflare.
4. Tag `vX.Y.Z` to build the APK. A tag is required whenever native plugins change. The version code is derived from the tag, so minor and patch must stay under 100 and each release must be higher than the last.

The Android package ID `com.ogdev.backlog` must never change. TypeScript stays on 6.x until `typescript-eslint` supports 7.
