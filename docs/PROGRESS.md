# Progress

Tracks build status against [implementation-plan.md](implementation-plan.md). Update this file as work lands.

**Legend:** ✅ done · 🟡 done in repo, needs a manual step · ⬜ not started

| Phase                            | Status |
| -------------------------------- | ------ |
| 1. Foundation                    | ✅     |
| 2. Search and add                | ⬜     |
| 3. Android shell                 | ⬜     |
| 4. Library and tracking          | ⬜     |
| 5. Backlog ordering              | ⬜     |
| 6. TV progress                   | ⬜     |
| 7. Offline read cache and polish | ⬜     |

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
