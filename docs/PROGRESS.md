# Progress

Tracks build status against [implementation-plan.md](implementation-plan.md). Update this file as work lands.

**Legend:** ✅ done · 🟡 done in repo, needs a manual step · ⬜ not started

| Phase                            | Status                                    |
| -------------------------------- | ----------------------------------------- |
| 1. Foundation                    | ✅                                        |
| 2. Search and add                | ✅                                        |
| 3. Android shell                 | 🟡 Code complete; needs your manual setup |
| 4. Library and tracking          | ⬜                                        |
| 5. Backlog ordering              | ⬜                                        |
| 6. TV progress                   | ⬜                                        |
| 7. Offline read cache and polish | ⬜                                        |

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
| Sideload and verify sign-in, search, add   | ⬜     | Needs the steps above                                                                                                              |

### Exit criteria

- [ ] A tagged release produces an APK you install from GitHub and use to add an item.

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

### Your next steps for Phase 3

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
