# Architecture

How Backlog is put together: its scope, the data model, the rules the data follows, and how the client talks to the backend. For why particular choices were made, see [decisions.md](decisions.md).

## Scope

Backlog is a tracker for one person or a small group restricted to an email allow-list. It's meant to run on free tiers, so there is no public sign-up and no plan for scale.

**In v1:**

- Sign in on the web and Android with Google or a 6-digit email code.
- Search TMDB (movies, TV), IGDB (games) and Google Books, or add custom items.
- Track status, rating, notes, start and finish dates, TV episode progress and book progress.
- Keep one backlog in your own order with drag and drop.
- Browse the library offline (read-only).
- Export everything as JSON.
- Install Android updates from GitHub Releases.

**Deliberately out of v1:** recommendations, release-date notifications, sharing or following, imports (Letterboxd, Goodreads, Steam), stats, barcode scanning, Android widgets, custom lists, offline writes, per-episode TV tracking, playtime, rewatch or replay counts, an account-deletion button, and localization.

**v2 candidates,** roughly in order of priority:

1. CSV, Letterboxd and Goodreads import
2. Release-date tracking and notifications
3. Custom lists
4. Offline writes with sync
5. Stats and a year in review
6. Per-episode TV tracking
7. An in-app update check, or the Play Store internal track

## Overview

```
┌──────────────────────────┐        ┌───────────────────────────┐
│ React PWA (Vite)         │        │ Android APK (Capacitor)   │
│ Cloudflare Worker assets │        │ same build, bundled       │
└────────────┬─────────────┘        └─────────────┬─────────────┘
             │        supabase-js (JWT)           │
             ▼                                    ▼
┌────────────────────────────────────────────────────────────────┐
│ Supabase                                                       │
│  Auth: Google ID token or redirect, email OTP, allow-list hook │
│  Postgres + RLS: media, entries, allowed_emails                │
│  Edge functions: search, details ──► TMDB / IGDB / Google Books │
└────────────────────────────────────────────────────────────────┘
```

One React codebase builds both targets. The web build is served as static assets by a Cloudflare Worker, with a service worker for offline use. The Android app is a Capacitor shell that bundles the same build, with no service worker. Native Google sign-in and the share sheet use Capacitor plugins.

### Repository layout

```
src/
  features/        screens and their hooks: auth, library, search, settings
  lib/             pure domain logic (status, backlog, tv, progress, rating) with unit tests
  lib/api/         the only code that talks to Supabase
  components/ui/   shadcn/ui
supabase/
  migrations/      SQL migrations
  functions/       search/ and details/ entrypoints, _shared/ logic with tests and fixtures
  tests/           RLS tests against local Supabase
  templates/       the 6-digit code email template
e2e/               Playwright tests
android/           the Capacitor Android project
.github/workflows/ ci.yml, android-release.yml, keepalive.yml
```

## Data model

### `media`: the shared catalog

| Column                                      | Notes                                      |
| ------------------------------------------- | ------------------------------------------ |
| `id` uuid PK                                |                                            |
| `type` enum                                 | `movie`, `tv`, `book`, `game`              |
| `source` enum                               | `tmdb`, `igdb`, `google_books`, `custom`   |
| `external_id` text, nullable                | null for custom items                      |
| `title`, `year`, `description`, `cover_url` | covers are hotlinked from the source's CDN |
| `details` jsonb                             | type-specific; see below                   |
| `created_by` uuid, nullable                 | set only on custom items                   |
| `fetched_at` timestamptz                    | when the metadata was last fetched         |

A unique index on (`source`, `external_id`) makes catalog rows upsertable. Custom rows always have a null `external_id`, and nulls are distinct, so any number of them can coexist.

`details` by type (types in `supabase/functions/_shared/types.ts`):

- **Movie:** `runtime_minutes`.
- **TV:** `season_episode_counts` (episodes TMDB lists per season, indexed by season number minus one, including unaired ones), `last_aired` (the latest aired episode), `next_air` (the next scheduled episode and its air date), `ended` (ended or cancelled), and `episode_runtime_minutes`. Rows saved before v0.6.0 lack the aired fields and are treated as fully aired and ended until refreshed.
- **Book:** `page_count`, `authors`.
- **Game:** `platforms`.

### `entries`: one user's tracking of one item

| Column                                            | Notes                                                       |
| ------------------------------------------------- | ----------------------------------------------------------- |
| `id` uuid PK                                      |                                                             |
| `user_id` uuid                                    | FK to `auth.users`                                          |
| `media_id` uuid                                   | FK to `media`                                               |
| `status` enum                                     | `backlog`, `in_progress`, `completed`, `on_hold`, `dropped` |
| `rating` smallint, nullable                       | 1 to 10, shown as five stars with half steps                |
| `notes` text                                      |                                                             |
| `started_on`, `finished_on` date, nullable        | plain dates, with no time or time zone                      |
| `progress_percent` smallint, `progress_pages` int | books                                                       |
| `tv_season`, `tv_episode` int                     | the last episode watched; defaults to 1 and 0 (S1E0)        |
| `backlog_position` text, nullable                 | a fractional index, `collate "C"`                           |
| `created_at`, `updated_at`                        |                                                             |

Constraints and triggers:

- Unique on (`user_id`, `media_id`): one entry per user per item. Adding something you already have opens the existing entry.
- Check: `backlog_position` is not null exactly when `status = 'backlog'`.
- Index on (`user_id`, `status`, `backlog_position`).
- The `updated_at` trigger ignores writes that change only `backlog_position`, so reordering the backlog doesn't affect the "Last updated" sort. A status change that sets or clears the position still counts.

### `allowed_emails`

`email` text primary key, stored lowercase. It's managed by hand in the dashboard, and clients can't read or write it.

### Access rules

- **`entries`** are owner-only for every operation. Inserts and updates must also reference media the user can see, so nobody can attach another user's custom item by guessing its ID.
- **`media`** catalog rows are readable by any signed-in user and writable only by the `details` function with the service role. Custom rows (`source = 'custom'`) are readable and writable only by their creator.
- **`allowed_emails`** has no client access.
- **`anon`** can read no table. Its only grant is `keepalive()`, a function that returns 1, which the keep-alive workflow calls.
- **Sign-up** goes through the `hook_before_user_created` Postgres function, which rejects emails missing from `allowed_emails` with "This email is not allowed to sign up for Backlog." Admin-created users bypass it.
- **`set_backlog_positions(positions jsonb)`** updates several backlog keys in one transaction. It's owner-only, all-or-nothing, and rejects entries that aren't in the backlog.

## Edge functions

Both functions require a signed-in user's JWT. The API keys (`TMDB_KEY`, `TWITCH_CLIENT_ID`, `TWITCH_CLIENT_SECRET`, `GOOGLE_BOOKS_KEY`) live in Supabase secrets. Nothing is cached between calls.

**`search`** takes `{ type: 'movie' | 'tv' | 'book' | 'game' | 'all', query }` and returns normalized results:

```ts
type SearchResult = {
  type: 'movie' | 'tv' | 'book' | 'game'
  source: 'tmdb' | 'igdb' | 'google_books'
  externalId: string
  title: string
  year?: number
  coverUrl?: string
  blurb?: string
}
```

`all` queries every source in parallel with a per-source timeout. Each source's failure, including a missing key, is reported in an `errors` array instead of failing the request.

**`details`** takes `{ source, externalId }` (plus `type` for TMDB, whose movie and TV endpoints differ). It fetches the full record, normalizes it, upserts the `media` row and returns it. The app calls it when you add an item, when you tap **Refresh metadata**, and on each visit to an in-progress TV show, so season counts and air dates stay current.

**IGDB** authenticates through a Twitch client-credentials token, fetched lazily, held in memory, and refreshed on expiry or after a 401 or 403.

**Code layout.** `search/index.ts` and `details/index.ts` are thin Deno entrypoints that read `Deno.env` and pass keys into `_shared`. The entrypoints use Deno globals and `npm:` specifiers, so they're excluded from `tsc` and unit tests; check them with `pnpm functions:serve`. `_shared` must stay free of Deno globals, because it's typechecked and tested under Node, and its imports use explicit `.ts` extensions. Each source has a normalizer tested against saved responses in `_shared/__fixtures__`.

## Core rules

### Status transitions

`statusTransition` in `src/lib/status.ts` applies these. Every status change goes through it.

| Transition              | Effect                                                         |
| ----------------------- | -------------------------------------------------------------- |
| any → Backlog           | `backlog_position` goes to the bottom (or the top when adding) |
| Backlog → anything else | `backlog_position` is cleared                                  |
| → In progress           | `started_on` is set to today if it's empty                     |
| → Completed             | `finished_on` is set to today if it's empty                    |
| On hold, Dropped        | no date changes                                                |

Completing never invents a start date, so going straight from Backlog to Completed sets only the finish date. Dates are always editable, and auto-fill touches only empty fields. "In progress" reads as Watching, Reading or Playing depending on the type.

### Backlog order

The backlog is one list across every type, ordered by `backlog_position`, a key from the [`fractional-indexing`](https://www.npmjs.com/package/fractional-indexing) package. A drop between neighbours `a` and `b` gets `generateKeyBetween(a, b)`.

- **Compare keys by code unit.** Postgres sorts them with `collate "C"`, and JavaScript has to agree, so sort with `compareBacklog` in `src/lib/backlog.ts` and never with `localeCompare`. Ties sort by date added.
- **Type tabs keep their slots.** The Movies, TV, Books and Games tabs show a filtered view of the same list. `reorderWithin` reshuffles a tab's entries among the global positions they already hold, so entries of other types never move or get written.
- **Write as few rows as possible.** A move in the All tab writes one row. A move in a type tab can need several, which go through `set_backlog_positions` so a reorder can't half-apply.
- **Duplicate keys are tolerated.** Two adds at the same moment can get the same key, and a move next to them skips to the next larger key.

### TV progress

The pointer (`tv_season`, `tv_episode`) is the last episode watched, starting at S1E0 ("Not started"). The rules live in `src/lib/tv.ts`.

- **Next episode** steps within a season, then rolls over to episode 1 of the next season, skipping seasons with no episodes.
- **Only aired episodes are offered.** At the latest aired episode, the button gives way to "S1 E4 airs Nov 12, 2026" (or "hasn't aired yet"), or "You're caught up" between seasons. A scheduled episode becomes available on its air date in local time.
- **The Completed prompt** appears after the final episode, and only for a show that has `ended`.
- **Starting a show:** pressing Next episode on a show that isn't Watching asks whether to move it to Watching. Declining holds for the rest of the visit.
- **Invalid pointers** (after a refresh shrinks a season, say) are clamped when read and never written back.
- **Set position** can jump to any listed episode, including unaired ones. Custom shows have no counts, so they just count up.

### Book progress

Enter pages or percent. When the source gave a page count, each derives the other (`src/lib/progress.ts`).

## Client

### Reads

- **The whole library is one TanStack query** (`entriesKey`: `entries` joined with `media`). Filtering and sorting happen on the client, and the entry screen reads from that cached list rather than running its own query, so optimistic updates have one cache to patch.
- **Library views and search scope live in the URL** (`/library?type=tv&status=backlog`, `/search?type=game`), so going back restores them and tabs can link to search.
- **Sorts:** Last updated (the default), Date added, Title and Rating. The Backlog status adds "Backlog order", which becomes the default and enables drag handles.

### Writes

- Edits in `src/features/library/useEntryMutations.ts` patch the cached list in `onMutate` and roll back with a toast in `onError`. They share a mutation key so only the last edit to settle refetches, since an earlier refetch would briefly undo another in-flight edit.
- Notes and progress save on blur. Dates save once they're complete.
- There are no offline writes. Write controls are disabled while offline, and mutations use `networkMode: 'always'`, so one that slips through fails at once instead of waiting with its optimistic value on screen.

### Offline and caching

- Only the library query is persisted to IndexedDB (`src/lib/query-client.ts`), and it's cleared on sign-out. Bump `CACHE_SCHEMA` whenever the cached shape changes.
- The library query keeps `gcTime: Infinity`. A 30-day value overflows `setTimeout` and evicts the restored data immediately.
- Online state starts from `navigator.onLine`, because TanStack otherwise assumes it's online at startup.
- The web app registers a service worker (`vite-plugin-pwa`) and offers updates with a **Reload** toast rather than forcing them. The APK has no service worker.
- Covers aren't cached offline; the generated placeholder shows instead.

### Auth

- **Email:** a 6-digit code, never a link, because on Android a link would open the website instead of the app. New users get the Confirm signup email and returning users get Magic Link, so both templates contain the code.
- **Google on the web:** a Supabase OAuth redirect.
- **Google on Android:** `@capgo/capacitor-social-login`, loaded on demand, uses Credential Manager to get an ID token for the **web** client ID and passes it to `signInWithIdToken` with a hashed nonce.
- **Offline sessions:** `AuthProvider` falls back to the stored session when an expired token can't be refreshed offline. A refresh token the server rejects still signs you out.
- **Sign-out** is per device (`scope: 'local'`).

## Delivery

| Target         | How it ships                                                                                            |
| -------------- | ------------------------------------------------------------------------------------------------------- |
| Database       | Migrations in `supabase/migrations/`, applied with `supabase db push`                                   |
| Edge functions | `pnpm functions:deploy`                                                                                 |
| Web            | Cloudflare builds and deploys `main`; `wrangler.jsonc` holds the single-page-app fallback               |
| Android        | A `vX.Y.Z` tag runs `android-release.yml`, which builds, signs and attaches the APK to a GitHub Release |
| Keep-alive     | `keepalive.yml` calls `keepalive()` twice a week so the free-tier project isn't paused                  |

The APK's version code comes from the tag (`v1.2.3` becomes `10203`), so minor and patch must stay under 100. Build-time values (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_GOOGLE_WEB_CLIENT_ID`) are public by design and are inlined by Vite. Only the API keys and the Android keystore are secrets.
