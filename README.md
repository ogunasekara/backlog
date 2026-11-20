# Backlog

A personal tracker for the movies, TV shows, books and games you want to get to. Search TMDB, IGDB and Google Books to add something, keep one ordered backlog across every type, and track status, rating, notes, dates and progress.

One React codebase ships as an installable web app (PWA) and as a sideloaded Android app. The backend is Supabase, and everything runs on free tiers.

## Features

- **One backlog, in your order.** Drag and drop to reorder. The Movies, TV, Books and Games tabs show the same list filtered, so reordering inside a tab never moves the other types.
- **Search four sources at once,** or within one type. Add custom items for anything the databases don't have.
- **Track what matters:** status (Backlog, Watching/Reading/Playing, Completed, On hold, Dropped), half-star ratings, notes, start and finish dates. Dates fill in by themselves when the status changes.
- **TV progress.** A "Next episode" button that rolls over between seasons, knows which episodes have aired and offers to mark an ended show completed.
- **Book progress** by page or percent.
- **Works offline (read-only).** The library is cached on the device, so it opens without a connection.
- **Sign in** with Google or a 6-digit email code. Only allow-listed emails can create an account.
- **Export** everything as JSON.
- Follows the system light/dark theme, with a bottom tab bar on phones and a sidebar on desktop.

## Stack

| Layer    | Tools                                                                                                                      |
| -------- | -------------------------------------------------------------------------------------------------------------------------- |
| Frontend | Vite, React, TypeScript, Tailwind and shadcn/ui, TanStack Query (persisted to IndexedDB), dnd-kit                          |
| Android  | Capacitor, built and signed by GitHub Actions and published to GitHub Releases                                             |
| Backend  | Supabase: Postgres with row-level security, Auth, and two edge functions (`search`, `details`) that call the metadata APIs |
| Hosting  | Cloudflare Workers static assets (web), GitHub Releases (APK)                                                              |

## Self-hosting

Backlog is built for one person or a small allow-listed group, so you run your own copy. You need free accounts with Supabase, Cloudflare, TMDB, Twitch (for IGDB) and Google Cloud. The Android app is optional.

**[docs/self-hosting.md](docs/self-hosting.md) walks through it step by step.**

## Local development

Needs Node 22+, pnpm 10 and Docker.

```sh
pnpm install
pnpm db:start                # local Supabase in Docker; prints the API URL and keys
cp .env.example .env.local   # paste the anon key from db:start
pnpm dev                     # http://localhost:5173
```

- The local allow-list contains `dev@example.com`. To add your own address, copy `supabase/seed.local.example.sql` to `supabase/seed.local.sql` and run `pnpm db:reset`.
- Sign-in emails aren't really sent. Read the code in Mailpit at http://127.0.0.1:54324.
- Search needs API keys: copy `supabase/functions/.env.example` to `supabase/functions/.env`, fill it in and run `pnpm functions:serve` in a second terminal. Without it, everything except search still works.

Checks (CI runs all of them):

```sh
pnpm lint
pnpm format:check
pnpm typecheck
pnpm test        # unit and component tests
pnpm test:rls    # row-level security tests against local Supabase
pnpm test:e2e    # Playwright; first run `pnpm exec playwright install chromium`
```

## Documentation

- [docs/self-hosting.md](docs/self-hosting.md): running your own copy.
- [docs/development.md](docs/development.md): local setup, tests, the manual test list and releasing.
- [docs/architecture.md](docs/architecture.md): scope, data model, core rules and how the client and backend fit together.
- [docs/decisions.md](docs/decisions.md): why the code is the way it is, including the bugs behind code that looks odd.
- [docs/archive/](docs/archive/): the original v1 plan, build log and setup notes.

## Data sources

Movie and TV data comes from [TMDB](https://www.themoviedb.org/). This product uses the TMDB API but is not endorsed or certified by TMDB. Game data comes from [IGDB](https://www.igdb.com/) and book data from [Google Books](https://books.google.com/).

## License

[MIT](LICENSE)
