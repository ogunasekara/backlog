# Development

How to run Backlog locally, test it, and release changes. To set up the hosted services, see [self-hosting.md](self-hosting.md).

## Local setup

Needs Node 22+, pnpm 10 and Docker.

```sh
pnpm install
pnpm db:start                 # local Supabase in Docker; prints the API URL and keys
cp .env.example .env.local    # paste ANON_KEY from the db:start output
pnpm dev                      # http://localhost:5173
```

The dev server always uses port 5173 (`strictPort`), because the auth redirect URLs depend on it.

- **Allow-list.** `supabase/seed.sql` allows `dev@example.com`. To add your own addresses without committing them, copy `supabase/seed.local.example.sql` to `supabase/seed.local.sql` (gitignored) and run `pnpm db:reset`.
- **Sign-in emails** aren't really sent. Open Mailpit at http://127.0.0.1:54324 and copy the 6-digit code. The local template is set in `supabase/config.toml`, so restart with `pnpm db:stop && pnpm db:start` after changing it.
- **Search** needs API keys. Copy `supabase/functions/.env.example` to `supabase/functions/.env`, fill it in, and run `pnpm functions:serve` in a second terminal. Without it, each source reports "not configured" and the rest of the app still works.
- **Google sign-in** is optional locally. Copy `supabase/.env.example` to `supabase/.env`, fill in a Google OAuth web client, and add `http://127.0.0.1:54321/auth/v1/callback` as an authorized redirect URI on that client.
- **Schema changes** go in a new file in `supabase/migrations/`, with cases added to `supabase/tests/rls.test.ts`. `pnpm db:reset` reapplies every migration and seed.

## Checks

CI runs all of these. Pull requests skip `test:e2e`, which runs only on pushes to `main`.

| Command             | What it runs                                                                         |
| ------------------- | ------------------------------------------------------------------------------------ |
| `pnpm lint`         | ESLint                                                                               |
| `pnpm format:check` | Prettier (`pnpm format` fixes)                                                       |
| `pnpm typecheck`    | TypeScript for the app, node configs, `supabase/functions/_shared` and `e2e`         |
| `pnpm test`         | Vitest unit and component tests in `src/` and `supabase/functions/`                  |
| `pnpm build`        | Production build                                                                     |
| `pnpm test:rls`     | RLS, allow-list and backlog-ordering tests against local Supabase (needs `db:start`) |
| `pnpm test:e2e`     | Playwright end-to-end tests (needs `db:start`)                                       |

To run part of a suite:

```sh
pnpm exec vitest run src/lib/tv.test.ts                 # one file
pnpm exec vitest run src/lib/status.test.ts -t "name"   # tests matching a name
pnpm exec vitest run --config vitest.rls.config.ts -t "name"
pnpm exec playwright test -g "name"
```

**Unit and component tests** mock the API modules and never reach a backend. `vite.config.ts` supplies dummy env values. Render with `renderWithProviders` from `src/test/render.tsx`, passing a pre-filled `queryClient` for cases that need a cached library.

**RLS tests** run against real local Supabase and read the connection details from `supabase status`.

**End-to-end tests.** Before the first run, install the browser with `pnpm exec playwright install chromium`. The tests start their own dev server on port 5174 against local Supabase (whatever `.env.local` points at), sign in once as `e2e-user@example.com` (allow-listed automatically) and read the code from Mailpit. The edge functions are stubbed, so no API keys are needed. Each test wipes that user's library first, so your own local data isn't touched. They run serially in desktop Chrome.

Under WSL with mirrored networking, Playwright's check for an already-running server stalls for about two minutes, because a closed port times out instead of refusing. Start the server yourself in another terminal first and the tests reuse it:

```sh
VITE_SUPABASE_URL=http://127.0.0.1:54321 VITE_SUPABASE_ANON_KEY=<ANON_KEY> \
  pnpm exec vite --host 127.0.0.1 --port 5174 --strictPort
```

## Android builds

Releases are built by GitHub Actions (see [self-hosting.md](self-hosting.md#7-android-app-optional)). To build locally you need Android Studio:

```sh
pnpm android:sync    # builds the web app and copies it into android/
pnpm android:open    # opens the project in Android Studio
```

A debug build is signed with your machine's debug key. For Google sign-in in a debug build, add another Android OAuth client with that key's SHA-1, which `cd android && ./gradlew signingReport` prints.

## Manual tests

CI can't cover everything. Touch dragging, native Google sign-in and the installed app need a real browser or phone. Walk the relevant sections after a change in that area, and the whole list before a release that touches several. "In the app" means the Android APK.

### Sign-in

1. On the web, sign in with Google and with an email code using an allow-listed address. No sign-in link is offered.
2. Try an address that isn't in `allowed_emails`: "This email is not allowed to sign up for Backlog."
3. In the app, sign in with Google (an account picker appears, not a browser) and with an email code.
4. Quit and reopen the app: you're still signed in. Sign out in the app: the web stays signed in.

### Search and add

1. Search each type (Movies, TV, Books, Games) and **All**. Results have covers.
2. Add one of each and check they appear in the library.
3. Add something you already have: it opens the existing entry.
4. Create a custom item: it gets a generated cover placeholder.

### Library and tracking

1. Switch type tabs, filter by status and try each sort. Open an entry and go back: the tab, filter and sort are still set.
2. Move a backlog item to Watching/Reading/Playing: the start date fills in. Mark it Completed: the finish date fills in and the start date stays.
3. Go straight from Backlog to Completed: only the finish date fills in.
4. Rate with half stars (try 3.5), clear the rating, edit both dates and write a note (it saves when you leave the field). Reload: everything is still there.
5. On a book, enter a page: the percent follows when the source gave a page count.
6. Tap **Refresh metadata** on a catalog item and **Remove** on a test item.

### Backlog ordering

1. Set the status filter to **Backlog**: the sort switches to "Backlog order" and rows have handles.
2. Drag rows with the mouse and reload: the order holds.
3. On the **Games** tab, drag the lower game above the higher one. Back on **All**, the two games have swapped and nothing else moved.
4. With the keyboard: Tab to a handle, press Space, move with the arrow keys and press Space to drop. Escape cancels.
5. Open a backlog entry: it shows "N of M in your backlog". Try **Move to top** and **Move to bottom**.
6. Change an entry's status to Backlog: it goes to the bottom.
7. On a phone, swipe over the rows (not the handles): the list scrolls. Hold a handle briefly and drag. The web shows the same order after a refresh.

### TV progress

1. Add an ended show with at least two seasons. It reads "Not started", "Up next: S1 E1".
2. Tap **Next episode** while it's in Backlog and choose **Keep as Backlog**. Tap again: no second prompt. Reopen it, tap **Next episode** and choose **Move to Watching**: the start date fills in.
3. **Set position** to the last episode of season 1, then **Next episode**: it rolls over to S2 E1. An episode past the end of a season is refused.
4. Set the position to one before the finale and tap **Next episode**: "That was the last episode" appears. **Mark completed** fills in the finish date.
5. The show's library row shows its episode, for example "S2 E8".
6. For a show that's still airing, set the position to the latest aired episode. **Next episode** goes away and the next air date shows (or "hasn't aired yet"), with no Completed prompt.

### Offline, install and settings

1. On the web, open the library, go offline (DevTools → Network → Offline) and reload. The app opens with "Offline, read-only" and your library. Entry controls are disabled and search asks for a connection. Back online, editing works again.
2. Install the site from Chrome's address bar: it opens in its own window with the Backlog icon.
3. After a deploy, an open tab offers "A new version of Backlog is ready" with **Reload**.
4. Settings shows your email, the version and the TMDB notice. **Export as JSON** downloads `backlog-export-<date>.json`.
5. In the app: open it online, turn on airplane mode, close it fully and reopen. The library opens read-only. Leave it more than an hour first to check the expired-token case.
6. In the app, back online, **Export as JSON** opens the share sheet.

## Releasing

Each target ships separately, in this order:

1. If `supabase/migrations/` changed: `pnpm exec supabase db push`.
2. If `supabase/functions/` changed: `pnpm functions:deploy`.
3. Merge to `main`. Cloudflare deploys the web app.
4. Tag `vX.Y.Z` and push the tag to build the APK. A tag is required whenever native plugins change. Minor and patch must stay under 100, and each release must be higher than the last. Run the _Android release_ workflow by hand first for a dry run if native code changed.
