# Backlog: Implementation Plan

_App name: **Backlog** (repo and package slug: `backlog`). A personal tracker for movies, TV shows, books, and games, as a web app (PWA) and a sideloaded Android app._

---

## 1. Summary

A personal tool with real accounts, restricted to an email allow-list and built so multi-user isn't painful later. You search external databases to add items, keep a single ordered backlog, and track status, rating, notes, dates, and progress. One React codebase ships to the web (Cloudflare Pages) and to Android (Capacitor APK, sideloaded via GitHub Releases). Target cost is $0/month.

### v1 "done" checklist

- [ ] Sign in on web and Android (Google, or 6-digit email code)
- [ ] Search all four sources and add items; create custom items
- [ ] Set status, rating, notes, and start/finish dates
- [ ] Reorder the backlog by drag and drop
- [ ] Track TV progress with a "next episode" button
- [ ] Browse the library offline (read-only)
- [ ] Export all data as JSON
- [ ] Install app updates from a GitHub Release

Anything not on this list waits for v2.

### Explicitly out of v1

Recommendations, release-date notifications, sharing/following, imports (Letterboxd, Goodreads, Steam), stats dashboards, barcode scanning, Android widgets, custom lists, offline writes, per-episode TV tracking, playtime hours, rewatch/replay counts, account-deletion button, localization.

---

## 2. Decisions locked in

| Area           | Decision                                                                                                               |
| -------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Audience       | Personal use; real accounts; email allow-list; no public launch                                                        |
| Metadata       | TMDB (movies, TV), IGDB (games), Google Books (books), plus manual custom items. Snapshot stored locally               |
| Backlog        | One global ordered list; per-type tabs show the filtered subsequence                                                   |
| Statuses       | Backlog, In progress, Completed, On hold, Dropped (one enum; "In progress" reads Watching / Reading / Playing by type) |
| Tracking depth | Status, rating, notes, start/finish dates; TV episode pointer; book percent or pages                                   |
| Rating         | Stored as integer 1-10, displayed as 5 stars with half-steps                                                           |
| Offline        | Cached reads only; writes need connectivity; optimistic UI                                                             |
| Frontend       | Vite, React, TypeScript, Tailwind + shadcn/ui, TanStack Query persisted to IndexedDB, dnd-kit                          |
| Native         | Capacitor; APK bundles the built web assets                                                                            |
| Backend        | Supabase: Postgres, RLS, edge functions                                                                                |
| Auth           | Google (native plugin + `signInWithIdToken`) and 6-digit email OTP (no deep links)                                     |
| Search UX      | Scoped to a media type (defaults to current tab), with an "All" option that fans out in parallel                       |
| Covers         | Hotlinked from source CDNs; generated title placeholder as fallback                                                    |
| Hosting        | Cloudflare Pages (web), GitHub Releases (APK)                                                                          |
| Environments   | Local Supabase (CLI + Docker) and one hosted production project                                                        |
| UI             | Follows system light/dark; bottom tab bar on mobile (Library, Search, Settings); sidebar on desktop                    |

---

## 3. Architecture

```
┌──────────────────────────┐        ┌───────────────────────────┐
│ React PWA (Vite)         │        │ Android APK (Capacitor)   │
│ Cloudflare Pages         │        │ same build, bundled       │
└────────────┬─────────────┘        └─────────────┬─────────────┘
             │        supabase-js (JWT)           │
             ▼                                    ▼
┌────────────────────────────────────────────────────────────────┐
│ Supabase                                                       │
│  Auth (Google ID token, email OTP, allow-list hook)            │
│  Postgres + RLS  (media, entries, allowed_emails)              │
│  Edge functions: search, details  ──► TMDB / IGDB / Google Books│
└────────────────────────────────────────────────────────────────┘
```

**Repo:** one private GitHub repo, no monorepo.

```
/src              React app (features/, components/, lib/)
/android          Capacitor project (generated)
/supabase
  /migrations     SQL migrations
  /functions      search/, details/, _shared/
  /tests          RLS tests
/e2e              Playwright tests
/.github/workflows  ci.yml, android-release.yml, keepalive.yml
```

---

## 4. Data model

### `media` (shared catalog)

| Column                                      | Notes                                                                                          |
| ------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `id` uuid PK                                |                                                                                                |
| `type` enum                                 | `movie`, `tv`, `book`, `game`                                                                  |
| `source` enum                               | `tmdb`, `igdb`, `google_books`, `custom`                                                       |
| `external_id` text, nullable                | null for custom                                                                                |
| `title`, `year`, `description`, `cover_url` |                                                                                                |
| `details` jsonb                             | Type-specific: runtime; TV `season_episode_counts: int[]`; book `page_count`; game `platforms` |
| `created_by` uuid, nullable                 | set only for custom items                                                                      |
| `fetched_at` timestamptz                    | last metadata snapshot                                                                         |

Unique on (`source`, `external_id`) where source is not `custom`.

### `entries` (per user)

| Column                                            | Notes                                                       |
| ------------------------------------------------- | ----------------------------------------------------------- |
| `id` uuid PK                                      |                                                             |
| `user_id` uuid                                    | FK to `auth.users`                                          |
| `media_id` uuid                                   | FK to `media`                                               |
| `status` enum                                     | `backlog`, `in_progress`, `completed`, `on_hold`, `dropped` |
| `rating` smallint, nullable                       | 1-10 check constraint                                       |
| `notes` text                                      |                                                             |
| `started_on`, `finished_on` date, nullable        | plain dates, no time or timezone                            |
| `progress_percent` smallint, `progress_pages` int | books                                                       |
| `tv_season`, `tv_episode` int                     | TV pointer; new entries start at S1E0                       |
| `backlog_position` text, nullable                 | fractional index; `COLLATE "C"`                             |
| `created_at`, `updated_at`                        |                                                             |

Constraints:

- Unique (`user_id`, `media_id`): one entry per user per item. Adding something you already have opens the existing entry.
- Check: `backlog_position` is not null **iff** `status = 'backlog'`.
- Index on (`user_id`, `status`, `backlog_position`).

### `allowed_emails`

`email` text PK. Enforced by a Supabase auth hook (or a `before user created` check) that rejects sign-ups not on the list. Managed by hand in the dashboard.

### RLS

- `entries`: select/insert/update/delete only where `user_id = auth.uid()`.
- `media`: select where `created_by is null or created_by = auth.uid()`. Custom items insert directly with `created_by = auth.uid()` and `source = 'custom'`. Non-custom catalog rows are upserted by the edge function using the service role.
- `allowed_emails`: no client access.

---

## 5. Metadata proxy (edge functions)

Every call requires a valid Supabase JWT. Keys live in Supabase secrets: `TMDB_KEY`, `TWITCH_CLIENT_ID`, `TWITCH_CLIENT_SECRET`, `GOOGLE_BOOKS_KEY`. No caching in v1.

**`search`** takes `{ type: 'movie'|'tv'|'book'|'game'|'all', query }` and returns normalized results:

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

`all` fans out to the three sources in parallel with a per-source timeout, so one slow or failing source doesn't block the rest.

**`details`** takes `{ source, externalId }`, fetches the full record (TV includes per-season episode counts), normalizes it, upserts the `media` row, and returns it. It's called when you add an item, when you tap "Refresh metadata", and when you open an in-progress TV show.

**IGDB quirk:** IGDB uses a Twitch OAuth client-credentials token. Fetch it lazily, hold it in memory, and refresh on expiry or a 401.

Each source has one normalizer module that is unit tested against saved fixture responses.

---

## 6. Core logic

### Status transitions

| Transition                   | Effect                                                                  |
| ---------------------------- | ----------------------------------------------------------------------- |
| any → Backlog                | `backlog_position` = bottom (or top via "add to top")                   |
| Backlog → anything else      | clear `backlog_position`                                                |
| → In progress                | set `started_on` if empty                                               |
| → Completed                  | set `finished_on` if empty; set `started_on` only if it was already set |
| Backlog → Completed directly | set only `finished_on`                                                  |
| On hold, Dropped             | no date changes                                                         |

Dates are always editable. Auto-fill only touches empty fields.

### Fractional indexing

Use the `fractional-indexing` package. Dropping an item between neighbors `a` and `b` computes `generateKeyBetween(a, b)` and updates **one row**. The per-type tabs are a filter over the global order, so dragging within "Games" never disturbs "Movies". Sort with `COLLATE "C"` in Postgres so string ordering matches the library. Unit tests cover insert-at-top, insert-at-bottom, and many repeated inserts in the same gap.

### TV "next episode"

Pointer is (`tv_season`, `tv_episode`); `counts` is `details.season_episode_counts`.

```
next(s, e, counts):
  if e < counts[s-1]      -> (s, e+1)
  else if s < len(counts) -> (s+1, 1)
  else                    -> finished  (prompt to mark Completed)
```

- New entries start at S1E0.
- Opening an in-progress show refreshes `season_episode_counts` (the one automatic refresh).
- Manual "set position" lets you jump to any S/E.
- Guard against a refreshed count that makes the pointer invalid (clamp to the last valid episode).

### Books

Track percent or pages. Page count comes from metadata; entering pages derives percent when a page count is known.

---

## 7. Build phases

Each phase ends with something that works end to end. Estimates assume part-time solo work.

### Phase 1: Foundation (about 1 week)

- Create the repo; Vite + React + TS + Tailwind + shadcn/ui; ESLint, Prettier, Vitest.
- `supabase init`; write the migrations for `media`, `entries`, `allowed_emails`, enums, constraints, RLS.
- Auth: Google (web redirect) and email OTP; allow-list hook; a basic signed-in shell with the mobile tab bar and desktop sidebar; light/dark by system setting.
- Hosted Supabase project; Cloudflare Pages deploy from `main`; `ci.yml` (lint, typecheck, unit tests).
- RLS tests against local Supabase.

**Exit:** you can sign in on the deployed site; a non-allow-listed email is rejected; RLS tests pass.

### Phase 2: Search and add (about 1.5 weeks)

- Register the API accounts: TMDB, Twitch developer app for IGDB, Google Books key.
- Edge functions `search` and `details` with normalizers and fixture tests.
- Search UI: type picker (defaults to current tab, plus "All"), result cards, add flow (choose status; "add to top" option).
- Custom item form: title, type, year, description, optional cover URL.
- Cover placeholder component. Duplicate handling opens the existing entry.

**Exit:** you can find and add an item from each of the four sources, and create a custom one.

### Phase 3: Android shell (about 1 week)

Done early on purpose, to prove the risky native parts before features pile up.

- App name is settled (**Backlog**). Decide the **Android package ID** now, in the form `com.<yourname>.backlog`; it is effectively permanent once installed.
- Add Capacitor; configure the Android project; native Google sign-in plugin exchanging an ID token via `signInWithIdToken`; set up the Google Cloud OAuth clients (web and Android, with the signing SHA-1).
- Generate the signing keystore; **back it up offline** (losing it means uninstalling and reinstalling).
- `android-release.yml`: on a version tag, build, sign, and attach the APK to a GitHub Release.
- Sideload onto your phone; verify sign-in, search, and add.

**Exit:** a tagged release produces an APK you install from GitHub and use to add an item.

### Phase 4: Library and tracking (about 1.5 weeks)

- Library screen with tabs (All, Movies, TV, Books, Games) and status filters; sorting by title, date added, rating.
- Entry detail: status with per-type labels, star rating (half-steps mapped to 1-10), notes, editable dates, book progress.
- Status-transition logic from section 6 with unit tests.
- Metadata "Refresh" button; optimistic updates via TanStack Query.

**Exit:** the core tracking loop works on web and Android.

### Phase 5: Backlog ordering (about 1 week)

- Backlog view as the ordered list of `status = backlog` entries; dnd-kit with touch and keyboard sensors and a drag handle (avoids scroll conflicts on mobile).
- Fractional-index generation, one-row update, optimistic reorder with rollback on failure.
- Per-type tab shows the filtered subsequence; "add to top" and "move to top/bottom" actions.
- Unit tests for index generation.

**Exit:** reordering persists across sessions and devices; the per-type tabs stay consistent with the global order.

### Phase 6: TV progress (about 1 week)

- Progress UI on the entry: S/E display, "Next episode" button, manual set-position.
- Rollover logic with unit tests; refresh season counts on open for in-progress shows.
- Completion prompt after the final episode; auto-move to _In progress_ on first "next episode" from Backlog (prompt, don't force).

**Exit:** stepping through a multi-season show rolls over correctly and ends with the Completed prompt.

### Phase 7: Offline read cache and polish (about 1 week)

- Persist TanStack Query cache to IndexedDB; app-shell service worker (PWA manifest and icons); verify the bundled APK opens with no network.
- Show an "offline, read-only" indicator and disable write actions when offline.
- Empty states, loading skeletons, error states, and toast messages.
- Settings: JSON export of all entries and media, sign out, app version.
- `keepalive.yml`: weekly scheduled ping to the Supabase project (a lightweight authenticated or public REST call).
- Playwright end-to-end tests: sign in, search and add, reorder, mark progress.
- Final pass against the v1 checklist.

**Exit:** every box in the v1 checklist is ticked.

**Rough total:** 7-8 weeks part-time.

---

## 8. Testing strategy

| Layer      | Tool                                         | Covers                                                                                                             |
| ---------- | -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Unit       | Vitest                                       | Fractional index generation, next-episode rollover, metadata normalizers (fixtures), status transitions and labels |
| Database   | Local Supabase + SQL/pgTAP or scripted tests | RLS: user A cannot read or write user B's entries; allow-list enforcement; the backlog-position check constraint   |
| End to end | Playwright                                   | Sign in, search and add, reorder, mark progress                                                                    |
| Android    | Manual on your phone                         | Google sign-in, offline open, update install                                                                       |

CI runs lint, typecheck, unit tests, and RLS tests on every PR.

---

## 9. Environments and delivery

- **Local:** Supabase CLI + Docker; migrations tested here first.
- **Production:** one hosted Supabase project; migrations applied with `supabase db push` (manually or in a deploy workflow); edge functions deployed with the CLI.
- **Web:** Cloudflare Pages builds `main`.
- **Android:** push a tag like `v0.3.0`; GitHub Actions builds and signs the APK and attaches it to a GitHub Release; download and install it on the phone. Keystore and passwords are in GitHub secrets, with an offline backup.
- **Secrets:** Supabase secrets for API keys; Supabase URL and anon key are public by design and go into the build.

---

## 10. Risks and mitigations

| Risk                                                                 | Mitigation                                                                                                                         |
| -------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Supabase free tier pauses after about a week of inactivity           | Weekly keep-alive workflow; daily use covers the rest                                                                              |
| No downloadable backups on the free tier                             | JSON export in Settings; add scheduled `pg_dump` later if the data feels irreplaceable                                             |
| Lost Android keystore                                                | Offline backup made in Phase 3 before the first release                                                                            |
| Package ID chosen badly                                              | Decide before the first APK (Phase 3); the name Backlog is already fixed                                                           |
| IGDB token handling or rate limits                                   | Lazy token fetch and refresh; one-user traffic is far below limits                                                                 |
| Metadata API terms (TMDB requires attribution; personal use is fine) | Show required attribution in Settings; revisit if the app ever goes public                                                         |
| Stale or broken cover URLs                                           | Placeholder fallback; copy to Supabase Storage as a later hardening step                                                           |
| Season counts change on airing shows                                 | Refresh on open for in-progress shows; clamp the pointer                                                                           |
| Drag-and-drop conflicts with touch scrolling                         | Drag handles and dnd-kit touch sensor activation delay; test on a real phone in Phase 5                                            |
| Free-tier Supabase edge function cold starts                         | Acceptable for one user; show a loading state on search                                                                            |
| Manual sideload updates get annoying                                 | Add an in-app "new version available" check against the GitHub Releases API, or move to Play Store internal testing ($25 one-time) |

---

## 11. Assumptions treated as settled

- One entry per user per item; re-adding opens the existing entry.
- New TV entries start at S1E0.
- Books take page count from metadata.
- No account-deletion button in v1 (export only).
- English only; sensible accessibility defaults (labels, contrast, keyboard support for drag-and-drop).
- Private repo, no license.

---

## 12. Before you start: your to-do list

1. Pick your Android package ID, e.g. `com.<yourname>.backlog` (needed by Phase 3). The app name is settled: Backlog.
2. Create accounts and keys: Supabase, Cloudflare, TMDB, Twitch developer (IGDB), Google Cloud (OAuth clients and Books API).
3. Add your email (and anyone else's) to `allowed_emails`.
4. Generate the Android keystore and back it up somewhere offline.

---

## 13. v2 candidates (ranked roughly)

1. CSV/Letterboxd/Goodreads import
2. Release-date tracking and notifications
3. Custom lists
4. Offline writes with sync
5. Stats and year-in-review
6. Per-episode TV tracking
7. In-app update check or Play Store internal track
