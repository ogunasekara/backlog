# Decisions

Why the code is the way it is. Each entry is a choice that could reasonably have gone another way, or a bug whose fix left code that looks odd. Read the relevant section before changing behaviour that seems wrong, and add to it when you make a choice like these.

Entries marked **Bug** describe something that broke and how it was fixed, and most have a regression test. The rest are deliberate decisions. The per-phase history is in [archive/PROGRESS.md](archive/PROGRESS.md).

## Database and access

- **Entries can only point at media the user can see.** The `entries` insert and update policies check that the media row is visible, so nobody can attach another user's custom item by guessing its ID.
- **Catalog `media` rows aren't writable by clients.** Only the `details` function writes them, with the service role. Clients write only their own `source = 'custom'` rows.
- **Admin-created users bypass the allow-list.** Supabase runs _Before User Created_ only for public sign-up. That's acceptable, because only the owner holds the service-role key.
- **The catalog uniqueness index isn't partial.** `on conflict (source, external_id)` can't infer a partial index unless the statement repeats its predicate, which a supabase-js upsert can't express. A plain unique index behaves the same, because custom rows always have a null `external_id` and nulls are distinct.
- **`tv_season` and `tv_episode` default to 1 and 0 on every entry,** whatever its type, so new TV entries start at S1E0 with no special case.
- **`anon` gets one function and no tables.** The keep-alive workflow needs a real query that touches no data, so it calls `keepalive()`.
- **Reordering doesn't bump `updated_at`.** Moving an item in the backlog isn't a change to it, and it would push reordered items to the top of the "Last updated" sort. The trigger compares the whole row minus `backlog_position` and `updated_at`, so columns added later still count as updates without touching the trigger.
- **Removing a custom item deletes its media row,** and the entry follows by cascade, so no orphaned rows are left.

## Edge functions

- **The entrypoints are excluded from `tsc`.** They use Deno globals and `npm:` specifiers that only the Supabase runtime resolves. The `_shared` modules they build on are fully typechecked and tested, and running the functions locally catches entrypoint mistakes.
- **TMDB accepts either credential.** A v4 read access token goes in the `Authorization` header and a v3 key goes in the query string. The code picks by the value's shape, since TMDB's dashboard calls both an "API key".
- **Book results lead their blurb with the authors,** which identify an edition better than the first line of a description.
- **Bug: one failing source broke the whole search.** `Promise.allSettled(tasks.map((t) => t.run()))` let a synchronous throw (a missing API key) escape before `allSettled` saw it, so one unconfigured source returned 500 for every type. Each task now runs inside an async wrapper.
- **Bug: `details` returned 502 for a client mistake.** A TMDB lookup without `type` is now rejected up front with 400.
- **Bug: upstream error bodies reached the UI.** A Google Books 429 put about 1 KB of JSON in the error message. Bodies are now collapsed and capped at 200 characters.

## Library and entries

- **The entry screen reads from the cached library** instead of its own query, so an edit shows in both places at once and optimistic updates have one cache to patch. That's fine at one person's library size.
- **Only the last in-flight edit refetches.** Edits share a mutation key, so rapid changes (a rating, then a status) don't briefly undo each other.
- **Notes and progress save on blur, and dates once they're complete.** While a year is being typed it passes through values like 0002 and 0202, so years before 1900 count as unfinished and aren't saved.
- **Completing doesn't fill in the start date.** The rule is to set `started_on` only if it was already set: never invent a start date.
- **Changing status to Backlog puts the item at the bottom.** "Add to top" is offered only when adding, and Move to top and Move to bottom are on the entry screen.
- **Library views and search scope live in the URL,** so the library tabs can link straight to `/search?type=game` and going back restores the view.
- **"Last updated" is the default sort,** except under the Backlog status, where "Backlog order" is the default so drag handles are available.
- **Adding something you already have opens the existing entry.** A unique-violation error becomes a redirect, not an error message.

## Backlog ordering

- **Type tabs can write more than one row.** The original plan said one row per move, but keeping each type inside the slots it already holds means a swap changes two rows and a rotation changes several. Only rows that need new keys are written, never other types, and a move in All is still one row. Several rows go through `set_backlog_positions` so a reorder can't half-apply.
- **Bug: a drag in a type tab sent the entry to the top of the whole backlog.** With shows at positions 2 and 6, moving the second to the top of the TV tab put it at position 1, because its key only had to sort before the first visible show. That's why `reorderWithin` swaps entries among their existing slots.
- **Bug: a dropped row jumped before settling.** dnd-kit clears its drag offsets on drop, but the optimistic cache update reaches the list a tick later (TanStack notifies on a timeout), so the row snapped back for a frame. The list now shows the drop locally until the cache has it or the save fails.
- **Duplicate keys are handled, not prevented.** Two adds at once can get the same key, and a move next to them skips to the next larger key. A unique index would turn that race into a confusing "already in your library" error.
- **Move keys are computed from the cached list,** so a drag shows at once. Moving into the backlog by changing status reads the true bottom from the server but shows a provisional place straight away.
- **The backlog is the library's Backlog filter,** not a separate screen.
- **Touch dragging uses a handle** with `touch-action: none` and a 120 ms hold, so swiping over a row still scrolls.
- **Fractional indexing arrived before drag and drop,** because the check constraint needs a position on every backlog entry from the first add.

## TV progress

- **The pointer is the last episode watched.** "Next episode" means "I watched the next one", so the Completed prompt appears on reaching the finale, not one press later.
- **Only aired episodes are offered.** TMDB lists a whole season before it airs, so a show with 2 of 10 episodes aired offered all 10 and would have prompted Completed at episode 10. `details` now also saves the last aired episode, the next scheduled one and whether the show has ended. A scheduled episode is offered from its air date in local time, because the saved data is only as fresh as the last refresh.
- **The Completed prompt needs an ended show.** At the end of what's listed for a show that's still going, it says "You're caught up". Completed is still available from the status menu.
- **The start prompt covers any status but Watching,** not just Backlog, so resuming an On hold show or starting a new season of a Completed one asks the same way. It's always a prompt, never forced.
- **Clamping happens on read, never with a write.** Writing the clamped value from an effect could loop on a failing save, and the next step or Set position saves a valid pointer anyway.
- **Seasons with no episodes are skipped.** TMDB lists announced seasons with 0 episodes, and without the skip, rollover would land on an episode that doesn't exist.
- **Season counts are indexed by season number,** not list position. If TMDB skipped a season in its list, every later season used to shift down by one.
- **Set position can go past the aired episodes,** up to what TMDB lists. The viewer may know better than the metadata.
- **Shows saved before v0.6.0 count as fully aired and ended** until they're refreshed, which matches how they behaved before.
- **Opening an in-progress show refreshes it on every visit,** quietly and without throttling. It's one TMDB call, and a failure keeps the cached counts.
- **There's no "previous episode" button.** Set position fixes a mis-tap.

## Offline and caching

- **Bug: the restored library vanished at once.** A 30-day `gcTime` is past the longest `setTimeout` delay (about 24.8 days), so the timer fired immediately and removed the library before any screen used it. The library query now has `gcTime: Infinity`.
- **Bug: the service worker cached nothing.** The manifest was listed twice with different revisions, which fails Workbox's install, and the worker still activated with an empty cache. Fixed in the glob patterns.
- **Bug: opened offline, the app thought it was online.** TanStack assumes it's online at startup, so the banner was missing and writes looked available. Online state now starts from `navigator.onLine`.
- **Bug: a failed refresh hid cached data.** The library and entry screens showed only the error even when the cached library was there. They now keep it on screen with **Try again**.
- **Only the library is persisted,** not search results.
- **A write that slips through offline fails at once** and rolls back, rather than waiting with its optimistic value on screen.
- **No service worker in the APK.** It already bundles its assets, and a worker could keep serving an old build after an update.
- **Covers aren't cached offline.** Caching third-party images needs CORS from each CDN, or opaque responses that count heavily against storage quota. The generated placeholder shows instead.
- **Updates are offered, not forced:** a toast with **Reload**, so a reload can't drop a note being typed.
- **Export reads the server, not the cache,** so it needs a connection.

## Auth

- **Email sign-in uses a 6-digit code, never a link.** On Android a link would open the website instead of the app. Hosted Supabase allows editing templates only with custom SMTP, which is why the setup needs it.
- **`@capgo/capacitor-social-login` instead of `@codetrix-studio/capacitor-google-auth`.** The Codetrix plugin hadn't been released since 2024 and uses the deprecated Google Sign-In API. The Capgo fork is maintained, tracks Capacitor 8 and uses Credential Manager. Only its Google provider is bundled, and it loads on demand so the web bundle doesn't carry it.
- **Bug: native Google sign-in rejected scopes.** The plugin refuses any `scopes` option unless `MainActivity` forwards activity results, and then falls back to the older authorization flow. No scopes are passed: the Credential Manager ID token already carries email and profile.
- **A dismissed account picker is a cancellation,** not an error, so no message appears.
- **Expired sessions offline:** supabase-js reports no session when it can't refresh an expired token, which would put an APK opened offline after an hour on the sign-in screen. The app uses the stored session until it can refresh. A refresh token the server rejects still signs you out.
- **Sign-out is per device** (`scope: 'local'`) and needs a connection like other writes.
- **The hosted Google provider needs both the client ID and the secret,** or sign-in fails with "missing OAuth secret".
- **Local Google sign-in reads env vars in `config.toml`,** so `supabase start` works without them. Google sign-in just doesn't work locally until `supabase/.env` is filled in.

## Build, CI and release

- **Cloudflare deploys a Worker with static assets,** not Pages. The single-page-app fallback is in `wrangler.jsonc`, because a `_redirects` rule failed the deploy as an infinite loop.
- **ESLint, not oxlint.** The current Vite template ships oxlint, which was swapped for ESLint.
- **TypeScript stays on 6.x** until `typescript-eslint` supports 7.
- **Unit tests never read developer env files.** A test once loaded the real Supabase client, whose env check throws without `.env.local`, so the suite passed locally and failed in CI. `vite.config.ts` now pins dummy `VITE_SUPABASE_*` values.
- **E2E tests stub `search` and `details`** (CI has no API keys) and run in desktop Chrome, because dnd-kit's keyboard reordering doesn't move under mobile emulation and touch dragging is checked on a phone anyway.
- **E2E tests run only on pushes to `main`,** not on pull requests, because they're slow.
- **CI reserves Supabase's ports (54320–54329).** They sit in Linux's ephemeral range, so an outbound connection could take one first and make the local stack fail to bind.
- **There's no Android build in `ci.yml`.** A Gradle build adds minutes to every PR, and the release workflow's dry run covers native changes.
- **Public build values are repository variables, not secrets,** matching Cloudflare's build variables. Only the keystore and its passwords are secrets.
- **The version code comes from the tag:** `v1.2.3` becomes `10203`, so minor and patch must stay under 100. Dry runs use version code 1 and aren't meant to be installed.
- **The keep-alive runs twice a week,** not weekly, because a late weekly run can miss Supabase's one-week pause limit.
- **The Android package ID is `com.ogdev.backlog`** and can never change for this deployment: Android treats a different ID as a different app.
