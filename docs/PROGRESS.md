# Progress

Tracks build status against [implementation-plan.md](implementation-plan.md). Update this file as work lands.

**Legend:** ✅ done · 🟡 done in repo, needs a manual step · ⬜ not started

| Phase                            | Status                             |
| -------------------------------- | ---------------------------------- |
| 1. Foundation                    | ✅                                 |
| 2. Search and add                | ✅                                 |
| 3. Android shell                 | ✅                                 |
| 4. Library and tracking          | ✅                                 |
| 5. Backlog ordering              | ✅                                 |
| 6. TV progress                   | 🟡 Code complete; needs your check |
| 7. Offline read cache and polish | ⬜                                 |

---

## Phase 6: TV progress

_Last updated: 2026-11-05_

### Tasks

| Task                                   | Status | Notes                                                                                                        |
| -------------------------------------- | ------ | ------------------------------------------------------------------------------------------------------------ |
| S/E display on the entry               | ✅     | "Not started" at S1E0, otherwise "S2 E5", with "Up next" and "5 of 10 in season 2". Rows show "S2 E5" too    |
| "Next episode" button                  | ✅     | Saves the next episode as the last one watched; optimistic like every other edit                             |
| Manual set position                    | ✅     | Dialog with season and episode, checked against the known counts; episode 0 means that season isn't started  |
| Rollover logic with unit tests         | ✅     | `src/lib/tv.ts`: within a season, to the next season, skipping empty seasons, and finished after the last    |
| Refresh season counts on open          | ✅     | Once per visit for an in-progress catalog show; quiet (no toasts), and a failure keeps the cached counts     |
| Clamp a pointer a refresh made invalid | ✅     | Displayed and stepped from the clamped position                                                              |
| Completion prompt after the final one  | ✅     | Only for a show that has ended. "That was the last episode": Mark completed / Not now; the button then stays |
| Prompt to move to In progress          | ✅     | On "Next episode" from a show that isn't Watching; declining holds for the rest of the visit                 |
| Only aired episodes are offered        | ✅     | Stops at the latest aired episode with "S1 E4 airs Nov 12, 2026"; "You're caught up" between seasons         |

### Exit criteria

- [ ] Stepping through a multi-season show rolls over correctly and ends with the Completed prompt. _Needs your [Phase 6 exit check](setup.md#phase-6-exit-check)._

### Verified

- 212 unit and component tests pass (51 new). The component tests drive the real entry screen: stepping a 2/1/2-episode show from S1E0 gives S1E1, S1E2, S2E1, S3E1, S3E2 and then the Completed prompt, which saves Completed with today's finish date. Also covered: the start prompt from Backlog (accept and decline), a one-episode show asking to complete rather than start, the refresh on open bringing in a new season, a failed refresh staying silent, clamping, set position with validation, and a custom show counting up with no seasons.
- Airing shows, with Nocturne's real TMDB data from 2026-11-05 (10 listed, 2 aired, episode 3 due that day): stepping stops at S1 E2 with "S1 E3 airs Nov 5, 2026", the episode is offered on its air date, a refresh that adds an aired episode makes it up next, and the end of a season with more to come is "caught up" with no Completed prompt.
- The local `details` function returns and saves the aired range for Nocturne.
- Lint, typecheck, format check and build are clean.

### Not verified

- **No browser or device click-through.** Component tests run against mocked APIs.
- **RLS tests were not re-run.** No schema or policy changes (the `tv_season`/`tv_episode` columns are from Phase 1).
- **Real TMDB season data** beyond Nocturne. A long-running show is the best real check.

### Decisions and deviations

- **The pointer is the last episode watched.** "Next episode" means "I watched the next one", so the Completed prompt appears when you reach the finale, not one press later.
- **The start prompt covers any status but Watching**, not just Backlog: resuming an On hold show, or starting a new season of a Completed one, asks the same way. It's always a prompt, never forced.
- **Clamping happens on read, not with a write.** Writing the clamped value from an effect could loop on a failing save. The next step or set position saves a valid position anyway.
- **Seasons with no episodes are skipped.** TMDB lists announced seasons with 0 episodes; without the skip, rollover would land on an episode that doesn't exist.
- **Season counts are now indexed by season number** (`seasonEpisodeCounts` in the TMDB normalizer). If TMDB skipped a season in its list, every later season used to shift down one. Takes effect as shows are refreshed, which opening an in-progress show now does.
- **Only aired episodes are offered (found in the exit check).** TMDB lists a whole season before it airs, so Nocturne offered all 10 episodes with 2 aired, and would have prompted Completed at E10. `details` now also saves the last aired episode, the next scheduled one with its air date, and whether the show has ended (Ended or Canceled). The scheduled episode is offered from its air date in local time, since the saved data is only as fresh as the last refresh.
- **The Completed prompt needs an ended show.** At the end of what's listed for a show that's still going, it says "You're caught up" instead. You can still set Completed from the status menu.
- **Set position can go past the aired episodes**, up to what TMDB lists. You may know better than the metadata.
- **Shows saved before this change count as fully aired and ended**, which is how they behaved before, until they're refreshed (open one you're watching, or tap **Refresh metadata**).
- **Custom shows (no counts) just count up.** No rollover and no Completed prompt; use set position for a new season.
- **No "previous episode" button.** Set position fixes a mis-tap.
- **The refresh on open runs on every visit**, with no throttle. It's one TMDB call.

### Your next steps for Phase 6

1. Redeploy the edge functions (`pnpm functions:deploy`) for the TMDB changes (season numbering and aired episodes). No migration and no new secrets.
2. Deploy `main` and tag `v0.6.0` for the APK.
3. Walk the [Phase 6 exit check](setup.md#phase-6-exit-check).

---

## Phase 5: Backlog ordering

_Last updated: 2026-11-05_

### Tasks

| Task                                  | Status | Notes                                                                                                                      |
| ------------------------------------- | ------ | -------------------------------------------------------------------------------------------------------------------------- |
| Backlog view                          | ✅     | Library with status **Backlog**: sorted by "Backlog order" by default, with a drag handle on each row                      |
| dnd-kit: mouse, touch, keyboard       | ✅     | Handle only, `touch-action: none`; touch starts after a 120 ms hold; arrow keys with screen-reader messages                |
| Fractional index, fewest-row update   | ✅     | `reorderWithin` in `src/lib/backlog.ts`. One row for a move in All; several in one atomic call when a type tab swaps slots |
| Optimistic reorder with rollback      | ✅     | Same pattern as the Phase 4 updates; a failed save restores the old order with a toast                                     |
| Per-type tabs as filtered subsequence | ✅     | A type tab reshuffles that type within the slots it already holds; other types never move or get written                   |
| Move to top / bottom                  | ✅     | On the entry screen, with "N of M in your backlog"                                                                         |
| Add to top                            | ✅     | Already in the add flow since Phase 2                                                                                      |
| Unit tests for index generation       | ✅     | Top, bottom, between, 50 inserts into one gap, filtered lists, duplicate keys, C-collation sorting                         |

### Exit criteria

- [x] Reordering persists across sessions and devices, and the per-type tabs stay consistent with the global order. _Exit check walked on 2026-11-05._

### Verified

- 161 unit and component tests pass (30 new), including real keyboard drags through dnd-kit: an All-tab move writes one row, a type-tab swap writes both entries in one call and leaves the movie between them in place, and a failed save rolls the order back. A seeded randomized test checks 300 backlogs and moves: the new order is exact, other types are never written, and an All-tab move writes at most one row.
- 33 RLS tests pass against local Supabase (4 new for `set_backlog_positions`): owner-only, all-or-nothing, rejects a non-backlog entry, not callable anonymously.
- Fractional keys sort the same in Postgres and JavaScript (existing RLS test; Docker works in WSL now).
- Lint, typecheck, format check and build are clean.

### Not verified

- **Touch dragging on a real phone.** The plan calls this out as a risk; jsdom can't simulate it. Check scrolling past the handles and the hold-to-drag feel on Android.
- **No browser click-through** of mouse dragging.

### Bugs found by running it

- **A dropped row jumped before settling.** dnd-kit clears the drag offsets on drop, but the optimistic cache update reaches the list a tick later (TanStack notifies on a timeout), so the row snapped back to its old slot for a frame. The list now shows the drop locally until the cache has it, or the save fails. Regression test added.

- **A type-tab drag jumped the entry to the top of the whole backlog.** With shows at positions 2 and 6, moving the second to the top of the TV tab put it at position 1, because the key only had to sort before the first visible show. Type tabs now keep their entries in the slots they already hold and swap them among those slots. Regression tests added (unit, randomized, component and RLS).

### Decisions and deviations

- **Type-tab reorders can write more than one row (a deviation from the plan's "one row").** Keeping each type in its own slots means a swap changes two rows, and a rotation changes several. Only the rows that need new keys are written: never other types, and a move in All is still one row. Several rows go through one database call, `set_backlog_positions` (new migration), so a reorder can't half-apply.
- **The backlog view is the library's Backlog filter, not a separate screen.** "Backlog order" is offered, and the default, only when the status filter is Backlog. Other sorts still work there, without handles.
- **Move keys are computed from the cached list**, so a drag shows at once. Moving into the backlog by changing status still reads the true bottom from the server, but shows a provisional bottom place straight away.
- **Duplicate keys are handled, not prevented.** Two simultaneous adds can get the same key; a move next to them skips to the first larger key. A unique index would turn that race into a confusing "already in your library" error.
- **Move to top/bottom lives on the entry screen** rather than in a row menu, to keep rows to one link plus a handle.
- **Ties sort by date added**, so equal keys still order the same everywhere.

### Your next steps for Phase 5 (done)

1. Push the new migration to the hosted project **before** deploying: `pnpm exec supabase db push`. Without it, type-tab swaps fail (moves in All still work).
2. Deploy `main` and tag `v0.5.0` for the APK.
3. Walk the [Phase 5 exit check](setup.md#phase-5-exit-check), especially dragging on your phone.

---

## Phase 4: Library and tracking

_Last updated: 2026-11-04_

### Tasks

| Task                                    | Status | Notes                                                                                         |
| --------------------------------------- | ------ | --------------------------------------------------------------------------------------------- |
| Library tabs, status filter, sorting    | ✅     | All / Movies / TV / Books / Games; sort by date added, title, rating. View lives in the URL   |
| Entry detail screen                     | ✅     | `/library/:entryId`: status, rating, dates, notes, book progress, refresh, remove             |
| Status labels per type                  | ✅     | Watching / Reading / Playing, in the entry, the list badges and a type tab's status filter    |
| Star rating (half-steps → 1-10)         | ✅     | Native radio inputs, so arrow keys work; hover preview; "Clear rating"                        |
| Status-transition logic with unit tests | ✅     | `src/lib/status.ts`, pure and tested against every row of section 6                           |
| Editable dates                          | ✅     | Saved once the date is complete; clearing saves `null`                                        |
| Book progress (pages or percent)        | ✅     | Pages derive the percent (and vice versa) when the page count is known; `src/lib/progress.ts` |
| Refresh metadata                        | ✅     | Catalog items only, through the existing `details` function                                   |
| Optimistic updates                      | ✅     | Patches the cached library at once, rolls back with a toast on failure                        |
| Duplicate add opens the existing entry  | ✅     | Closes the Phase 2 gap                                                                        |

### Exit criteria

- [x] The core tracking loop works on web and Android. _Exit check walked on 2026-11-05._

### Verified

- 131 unit and component tests pass (54 new): status transitions, rating mapping, book progress, filter and sort, and the library and entry screens (optimistic status change, rollback on a failed save, half-star rating, notes on blur, date saving, page → percent, refresh, remove, duplicate → entry).
- Lint, typecheck, format check and build are clean.

### Not verified

- **No browser or device click-through.** The screens are covered by component tests against mocked APIs only.
- **RLS tests were not re-run.** Docker isn't available in this WSL distro. Nothing in the schema or policies changed, and CI runs them on the PR.

### Decisions and deviations

- **No migration.** Every column Phase 4 needs was already in the Phase 1 schema.
- **Remove from library added.** Not in the plan, but a tracker you can't delete from is awkward. Removing a custom item also deletes its media row (the entry follows by cascade), so no orphan rows are left.
- **The entry screen reads from the cached library list** rather than its own query, so an edit shows up in both places at once and optimistic updates have one cache to patch. That's fine at one user's library size.
- **Status changes into the backlog go to the bottom.** "Add to top" stays on the add flow; move to top/bottom is Phase 5.
- **Notes and progress save on blur; dates save once complete.** A typed year passes through values like 0002 and 0202, so years before 1900 count as unfinished and aren't saved.
- **Only the last in-flight edit refetches**, so rapid edits (e.g. rating and then status) don't briefly undo each other.
- **Completing doesn't fill the start date.** This follows section 6 ("set `started_on` only if it was already set"), read as: never invent a start date.

### Your next steps for Phase 4 (done)

1. Deploy `main` (Cloudflare picks it up) and tag `v0.4.0` for the APK.
2. Walk the [Phase 4 exit check](setup.md#phase-4-exit-check) and send me anything that looks off.

---

## Phase 3: Android shell

_Last updated: 2026-10-10_

### Tasks

| Task                                       | Status | Notes                                                                                                                              |
| ------------------------------------------ | ------ | ---------------------------------------------------------------------------------------------------------------------------------- |
| Android package ID                         | ✅     | **`com.ogdev.backlog`**. Permanent once installed                                                                                  |
| Capacitor + Android project                | ✅     | Capacitor 8; `android/` committed; `pnpm android:sync` / `android:open`                                                            |
| Native Google sign-in                      | ✅     | `@capgo/capacitor-social-login` (Credential Manager) → ID token → `signInWithIdToken`, with a hashed nonce. Web keeps the redirect |
| Google Cloud OAuth clients (web + Android) | 🟡     | Yours: create the Android client with the release SHA-1 ([setup.md step 7](setup.md#7-android-phase-3))                            |
| Email sign-in: link → 6-digit code         | ✅     | Code-entry step on the sign-in screen; local templates in `config.toml`                                                            |
| Custom SMTP + hosted code templates        | 🟡     | Yours: Gmail app password, then the two templates ([setup.md step 6](setup.md#6-email-sign-in-codes-phase-3))                      |
| Signing keystore, backed up offline        | 🟡     | Yours to generate and back up ([setup.md step 7](setup.md#7-android-phase-3))                                                      |
| `android-release.yml`                      | ✅     | Tag `vX.Y.Z` → signed APK on a GitHub Release. Manual run = dry run with the APK as an artifact                                    |
| Sideload and verify sign-in, search, add   | ✅     | Released as `v0.3.0` and `v0.3.1`                                                                                                  |

### Exit criteria

- [x] A tagged release produces an APK you install from GitHub and use to add an item.

### Verified

- Email code sign-in against local Supabase with the real templates: a new user gets the "Confirm signup" email and a returning user the "Magic Link" one, both with a 6-digit code; the right code gives a session, a wrong one is rejected, and a non-allow-listed email is still refused.
- Sign-in screen component tests: send code, verify, wrong code, resend, change email, allow-list rejection, Google start, and a dismissed Google picker showing no error. 77 unit tests and 29 RLS tests pass.
- `cap add android` and `cap sync` succeed and pick up the plugin.

### Not verified

- **No Android build has run yet.** This machine has no JDK or Android SDK, so the Gradle build (including the signing config and version properties) first runs in GitHub Actions. Do the dry run before tagging.
- **Native Google sign-in is untested on a device.** It depends on the Android OAuth client matching the release keystore's SHA-1.
- **Hosted email codes** depend on the SMTP and template setup in the dashboard.

### Decisions and deviations

- **`@capgo/capacitor-social-login` instead of `@codetrix-studio/capacitor-google-auth`.** The Codetrix plugin hasn't been released since 2024 and uses the deprecated Google Sign-In API. The Capgo fork is maintained, released alongside Capacitor 8, and uses Credential Manager. Only its Google provider is bundled.
- **The plugin loads on demand**, so the web bundle doesn't carry it. A dismissed account picker is treated as a cancellation, not an error.
- **Public build values are repository _variables_, not secrets**, matching Cloudflare's build variables. Only the keystore and its passwords are secrets.
- **Version code comes from the tag**: `v1.2.3` → `10203`, so minor and patch must stay under 100. Dry runs use version code 1 and are not meant for installing.
- **No Android build in `ci.yml`.** A Gradle build adds several minutes to every PR; the release workflow's dry run covers it when native code changes.

### Your next steps for Phase 3 (done)

1. Custom SMTP and the code templates on the hosted project ([setup.md step 6](setup.md#6-email-sign-in-codes-phase-3)), then deploy `main` and confirm email codes work on the site.
2. Generate the keystore, **back it up offline**, and create the Android OAuth client ([setup.md step 7](setup.md#7-android-phase-3)).
3. Add the GitHub variables and secrets, run the dry run, then tag `v0.3.0`.
4. Install the APK and walk the [Phase 3 exit check](setup.md#phase-3-exit-check). Send me any errors (especially Google's `[28444]`) and I'll fix them.

---

## Phase 2: Search and add

_Last updated: 2026-10-08_

### Tasks

| Task                                            | Status | Notes                                                                                            |
| ----------------------------------------------- | ------ | ------------------------------------------------------------------------------------------------ |
| API accounts (TMDB, Twitch/IGDB, Google Books)  | ✅     | Yours to create; steps in [setup.md](setup.md#4-metadata-api-keys-phase-2)                       |
| Edge function `search`                          | ✅     | Scoped or `all`; fans out in parallel, per-source timeout, partial failures reported in `errors` |
| Edge function `details`                         | ✅     | Fetches, normalizes, upserts `media` with the service role, returns the row                      |
| Normalizers with fixture tests                  | ✅     | `supabase/functions/_shared/{tmdb,igdb,google-books}.ts` against saved fixtures                  |
| IGDB Twitch token handling                      | ✅     | Lazy fetch, in-memory cache, refresh on expiry, one retry on 401/403                             |
| Search UI (type picker, result cards, add flow) | ✅     | Scope in the URL (`/search?type=book`); status picker and "add to top"                           |
| Custom item form                                | ✅     | Title, type, year, description, cover URL, initial status                                        |
| Cover placeholder component                     | ✅     | Generated initials and gradient; falls back when a hotlinked cover fails                         |
| Duplicate handling                              | ✅     | Unique violation becomes "Already in your library" rather than an error                          |
| Library list                                    | ✅     | Minimal list so adds are visible; the real library screen is Phase 4                             |

### Exit criteria

- [x] Add an item from each of the four sources. _Verified with real keys. Book search worked on 2026-10-09; on 2026-10-10 Google's search endpoint was returning 503 `backendFailed` (upstream outage, not our code)._
- [x] Create a custom item. _Covered by component tests; not yet clicked through in a browser._

### Verified

- Both functions run on the local edge runtime: auth required (401 without a JWT), request validation (400), wrong method (405).
- With no keys configured, a scoped search and `all` both return 200 with a per-source `errors` array, so one missing key never breaks the others.
- Migration `20261009000000` applies cleanly; 29 RLS tests pass, including catalog upsert-on-conflict, many custom rows coexisting, and fractional positions sorting identically in Postgres (`collate "C"`) and JavaScript.
- 74 unit tests: normalizers against fixtures, fan-out and interleaving, IGDB token cache and retry, backlog position generation, cover fallback, and the search/add/custom-item UI flows.

### Not verified

- **No real API responses yet.** Fixtures are hand-built from the current TMDB, IGDB and Google Books docs, so a field could still be wrong in practice. First real search will confirm.
- **No browser click-through.** The UI is covered by component tests against mocked APIs, not by an end-to-end run.

### Bugs found by running it

- **A source that failed synchronously broke the whole fan-out.** `Promise.allSettled(tasks.map((t) => t.run()))` lets a synchronous throw (a missing API key) escape before `allSettled` sees it, so one unconfigured source returned 500 for every type. Fixed with an async wrapper; regression test added.
- **`details` returned 502 for a client mistake.** Omitting `type` for a TMDB lookup is a bad request, not an upstream failure; now validated up front as 400.
- **Upstream error bodies leaked into the UI.** A Google Books 429 put ~1 KB of JSON in the error message; bodies are now collapsed and capped at 200 characters.

### Decisions and deviations

- **Catalog uniqueness index is no longer partial.** `on conflict (source, external_id)` cannot infer a partial index unless the statement repeats its predicate, which supabase-js upsert cannot express. A plain unique index behaves the same here, because custom rows always have a null `external_id` and nulls are distinct.
- **Search scope lives in the URL, not component state.** Phase 4's library tabs can link straight to `/search?type=game`, which is what "defaults to the current tab" needs.
- **Fractional indexing arrived early.** The backlog check constraint requires a position on every backlog entry, so "add to top/bottom" needed it now rather than in Phase 5. Drag-and-drop reordering is still Phase 5.
- **Duplicates show a toast rather than opening the entry.** The entry screen does not exist until Phase 4; `DuplicateEntryError` already carries the existing entry's id for then.
- **The function entrypoints are excluded from `tsc`.** They use Deno globals and `npm:` specifiers that only the Supabase runtime resolves; the shared modules they build on are fully typechecked and tested. Running them locally is what catches entrypoint mistakes.
- **TMDB accepts either credential shape.** A v4 read access token goes in the `Authorization` header, a v3 key in the query string; the code picks based on the value, since the dashboard calls both "API key".
- **Books search leads its blurb with the authors**, which identify an edition better than the opening line of the description.

### Your next steps for Phase 2

1. Create the three API accounts and set the secrets (see [setup.md](setup.md#4-metadata-api-keys-phase-2)).
2. Run `pnpm functions:deploy`.
3. Walk the Phase 2 exit check. Tell me what looks wrong and I will fix the normalizers against the real responses.

---

## Phase 1: Foundation

_Last updated: 2026-10-08_

### Tasks

| Task                                           | Status | Notes                                                                                                                                                   |
| ---------------------------------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Repo; Vite + React + TS + Tailwind + shadcn/ui | ✅     | Vite 8, React 19, TS 6, Tailwind 4, shadcn/ui (new-york, neutral). Pushed to private repo [ogunasekara/backlog](https://github.com/ogunasekara/backlog) |
| ESLint, Prettier, Vitest                       | ✅     | `eslint.config.js`, `.prettierrc.json` (with Tailwind class sorting), Vitest + Testing Library in jsdom                                                 |
| `supabase init` + migrations                   | ✅     | `supabase/migrations/20261008000000_initial_schema.sql`: enums, `media`, `entries`, `allowed_emails`, constraints, indexes, RLS                         |
| Auth: Google (web redirect)                    | ✅     | Working on the deployed site. Hosted provider needed both the client ID and secret ("missing OAuth secret" otherwise)                                   |
| Auth: email sign-in                            | ✅     | Sign-in **link** using Supabase's default template. The 6-digit code moved to Phase 3: editing hosted templates requires custom SMTP                    |
| Allow-list hook                                | ✅     | `public.hook_before_user_created`, wired in `supabase/config.toml`. Hosted project needs it enabled in the dashboard                                    |
| Signed-in shell                                | ✅     | Bottom tab bar (mobile) and sidebar (md+); Library / Search / Settings routes; sign out in Settings                                                     |
| Light/dark by system setting                   | ✅     | `prefers-color-scheme` media query; no toggle                                                                                                           |
| Hosted Supabase project                        | ✅     | Linked, schema pushed, allow-list hook enabled. Email templates left at defaults                                                                        |
| Cloudflare deploy from `main`                  | ✅     | Deploys as a Worker with static assets; SPA fallback is in `wrangler.jsonc` (a `_redirects` rule failed the deploy with an infinite-loop error)         |
| `ci.yml` (lint, typecheck, unit tests)         | ✅     | Also runs format check, build, and RLS tests against local Supabase. Green on GitHub (first run on `main`, 2026-10-08)                                  |
| RLS tests against local Supabase               | ✅     | `supabase/tests/rls.test.ts`: 25 tests passing locally                                                                                                  |

### Exit criteria

- [x] You can sign in on the deployed site. _Google and email link both work._
- [x] A non-allow-listed email is rejected. _Verified locally for email sign-in and password sign-up; Google goes through the same hook._
- [x] RLS tests pass. _25/25 locally._

### What the RLS tests cover

- Allow-list: unlisted email rejected via email sign-in and password sign-up; listed email accepted (case-insensitive).
- Anonymous users can't read `media`, `entries`, or `allowed_emails`.
- Signed-in users can't read or write `allowed_emails`.
- `entries`: owner-only select/update/delete; can't insert for another user, reassign `user_id`, or reference another user's custom media; one entry per user per item.
- `backlog_position` is set if and only if `status = 'backlog'`.
- `media`: catalog rows visible to all signed-in users and writable only by the service role; custom rows visible to and editable by their creator only.

### Decisions and deviations

- **ESLint instead of oxlint.** The current Vite template ships oxlint; replaced with ESLint per the plan.
- **TypeScript pinned to 6.0.** TS 7 is out, but `typescript-eslint` doesn't support it yet.
- **Admin-created users bypass the allow-list hook.** Supabase only runs _Before User Created_ for public sign-up paths. That's fine, since only you hold the service-role key.
- **Entries can only point at media the user can see.** Added a check to the `entries` insert/update policies so you can't attach another user's custom item by guessing its UUID.
- **Catalog `media` rows aren't user-writable at all.** Only the edge functions (service role) write them, starting in Phase 2.
- **`tv_season` / `tv_episode` default to 1 / 0 on every entry**, regardless of type, so new TV entries start at S1E0 without special-casing.
- **Google provider in `config.toml` reads env vars.** Local `supabase start` works without them; Google sign-in just won't work locally until `supabase/.env` is filled in.
- **Bundle size warning (577 kB).** Not addressed yet; route-level code splitting can come in Phase 7.

### Deferred to Phase 3

- **6-digit email code instead of a link.** Hosted Supabase only allows editing email templates with custom SMTP. Links are fine on the web, but on Android they'd open the website rather than the app. Phase 3 adds custom SMTP (e.g. Gmail with an app password), applies `supabase/templates/otp.html`, and puts the code-entry step back on the sign-in screen.
