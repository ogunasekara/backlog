# Setup

How to run Backlog locally and how to stand up the hosted environments. Steps marked **(manual)** need your accounts and can't be scripted from the repo.

## Local development

Prerequisites: Node 22+, pnpm 10, Docker Desktop running.

```sh
pnpm install
pnpm db:start                 # local Supabase; prints API URL and keys
cp .env.example .env.local    # paste ANON_KEY from the db:start output
pnpm dev                      # http://localhost:5173
```

- Local allow-list: `supabase/seed.sql` has `dev@example.com`. To add your own emails without committing them, copy `supabase/seed.local.example.sql` to `supabase/seed.local.sql` (gitignored) and run `pnpm db:reset`.
- Sign-in emails are not really sent locally. Open Mailpit at http://127.0.0.1:54324 and copy the 6-digit code from there. The code template is set in `supabase/config.toml`; restart (`pnpm db:stop && pnpm db:start`) after changing it.
- Edge functions (search/details) need API keys: copy `supabase/functions/.env.example` to `supabase/functions/.env`, fill it in, then run `pnpm functions:serve` in a second terminal. Without it, search returns "not configured" per source and the rest of the app still works.
- Local Google sign-in is optional. To enable it, copy `supabase/.env.example` to `supabase/.env`, fill in a Google OAuth web client, and add `http://127.0.0.1:54321/auth/v1/callback` as an authorized redirect URI on that client.

### Checks

| Command             | What it runs                                                                               |
| ------------------- | ------------------------------------------------------------------------------------------ |
| `pnpm lint`         | ESLint                                                                                     |
| `pnpm format:check` | Prettier                                                                                   |
| `pnpm typecheck`    | TypeScript                                                                                 |
| `pnpm test`         | Vitest unit/component tests                                                                |
| `pnpm test:rls`     | RLS, allow-list and backlog-ordering tests against local Supabase (needs `pnpm db:start`)  |
| `pnpm test:e2e`     | Playwright: sign in, search and add, reorder, TV progress, offline (needs `pnpm db:start`) |

**End-to-end tests.** First time only: `pnpm exec playwright install chromium`. The tests start their own dev server on port 5174 against local Supabase (whatever `.env.local` says), sign in once as `e2e-user@example.com` (added to the local allow-list automatically), and read the code from Mailpit. The edge functions are stubbed, so no API keys are needed. Each test wipes that user's library first; your own local data isn't touched.

Under WSL with mirrored networking, Playwright's check for an already-running server waits about two minutes, because a closed port times out instead of refusing. To skip the wait, start the server yourself in another terminal first; the tests then reuse it:

```sh
VITE_SUPABASE_URL=http://127.0.0.1:54321 VITE_SUPABASE_ANON_KEY=<ANON_KEY> \
  pnpm exec vite --host 127.0.0.1 --port 5174 --strictPort
```

## Hosted environments (manual)

### 1. GitHub repo

```sh
gh repo create backlog --private --source . --push
```

CI (`.github/workflows/ci.yml`) runs on pushes to `main` and on PRs: checks and unit tests, RLS tests, and the end-to-end tests, each job against its own local Supabase.

**Keep-alive** (`.github/workflows/keepalive.yml`) calls the `keepalive()` database function on Mondays and Thursdays so the free-tier project isn't paused. It uses the `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` repository variables from [step 7](#7-android-phase-3) and needs the keepalive migration pushed. GitHub turns off scheduled workflows after 60 days with no commits; if that happens, re-enable it under Actions. Run it once by hand (Actions → _Keep-alive_ → _Run workflow_) to check it.

### 2. Supabase production project

1. Create a project at https://supabase.com/dashboard (free tier).
2. Link and push the schema:
   ```sh
   pnpm exec supabase login
   pnpm exec supabase link --project-ref <project-ref>
   pnpm exec supabase db push
   ```
3. **Auth → Hooks**: add a _Before User Created_ hook → Postgres function → `public.hook_before_user_created`.
4. **Table editor → allowed_emails**: insert your email (lowercase).
5. **Auth → Providers → Email**: enabled; leave "Confirm email" on or off (codes work either way).
6. **Auth → Email Templates**: switch to the 6-digit code template. Editing templates needs custom SMTP first; both are in [step 6](#6-email-sign-in-codes-phase-3).
7. **Auth → URL Configuration**: Site URL = your Cloudflare URL (e.g. `https://backlog.<your-subdomain>.workers.dev`). Add `http://localhost:5173` to Redirect URLs.
8. **Auth → Providers → Google**: enable and paste the web client ID and secret from step 3 below.

> Free-tier email sending is rate limited (a few emails per hour). Configure custom SMTP under **Auth → SMTP** if that becomes a problem.

### 3. Google OAuth (web client)

1. Google Cloud Console → APIs & Services → Credentials → _Create OAuth client ID_ → **Web application**.
2. Authorized JavaScript origins: your Pages URL and `http://localhost:5173`.
3. Authorized redirect URI: `https://<project-ref>.supabase.co/auth/v1/callback`.
4. Consent screen: External, Testing mode is fine; add your Google account as a test user.

The Android client (with signing SHA-1) is in [step 7](#7-android-phase-3).

### 4. Metadata API keys (Phase 2)

Three accounts, all free. Keys live in Supabase secrets, never in the repo or the web build.

| Key                                         | Where to get it                                                                                                                                            |
| ------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `TMDB_KEY`                                  | https://www.themoviedb.org/settings/api — use the **API Read Access Token** (a long JWT) or the v3 API key; both work.                                     |
| `TWITCH_CLIENT_ID` / `TWITCH_CLIENT_SECRET` | https://dev.twitch.tv/console/apps — register an app (IGDB authenticates through Twitch). Any OAuth redirect URL is fine; the app uses client credentials. |
| `GOOGLE_BOOKS_KEY`                          | Google Cloud Console → enable the **Books API** → create an API key.                                                                                       |

Google Books accepts unauthenticated calls, but its keyless daily quota is zero, so the key is required in practice.

Set them on the hosted project and deploy the functions:

```sh
pnpm exec supabase secrets set TMDB_KEY=... TWITCH_CLIENT_ID=... TWITCH_CLIENT_SECRET=... GOOGLE_BOOKS_KEY=...
pnpm functions:deploy
```

For local work, put the same values in `supabase/functions/.env` (gitignored) and run `pnpm functions:serve`.

### 5. Cloudflare (Workers static assets)

The dashboard's Git flow deploys a Worker that serves `dist/`. `wrangler.jsonc` configures it, including the single-page-app fallback. Don't add a `_redirects` SPA rule; Workers reject it as an infinite loop.

1. Cloudflare dashboard → Workers & Pages → Create → _Import a repository_ → pick the repo.
2. Build command: `pnpm build`. Deploy command: `npx wrangler deploy` (the default). Production branch: `main`.
3. **Settings → Build → Variables and secrets** (build-time, not runtime: Vite inlines them during the build):
   - `VITE_SUPABASE_URL` = `https://<project-ref>.supabase.co`
   - `VITE_SUPABASE_ANON_KEY` = the project's anon (or publishable) key
   - `NODE_VERSION` = `22`
4. The site is served at `https://backlog.<your-subdomain>.workers.dev`. Use that URL for the Supabase Site URL and the Google OAuth origins.

### 6. Email sign-in codes (Phase 3)

Email sign-in sends a 6-digit code rather than a link, because on Android a link would open the website instead of the app. Hosted Supabase only lets you edit email templates once custom SMTP is set up.

1. **Gmail app password**: turn on 2-Step Verification for the Google account that will send the email, then create an app password at https://myaccount.google.com/apppasswords.
2. **Supabase → Auth → Emails → SMTP Settings**: enable custom SMTP.
   - Sender email: that Gmail address. Sender name: `Backlog`.
   - Host `smtp.gmail.com`, port `587`, username: the Gmail address, password: the app password.
   - Supabase warns that Gmail is "designed for sending personal rather than transactional email". That's expected and fine here: a handful of codes a day to allow-listed addresses is well within Gmail's limits. If you ever outgrow it, switch to a transactional provider such as Resend, which needs a domain you own.
3. **Auth → Emails → Templates**: in both **Magic Link** and **Confirm signup**, set the subject to `Your Backlog sign-in code` and paste in the body of `supabase/templates/otp.html`. (A new user gets the Confirm signup email and a returning one gets Magic Link, so both need the code.)
4. **Auth → Providers → Email**: check that **Email OTP Length** is `6`. The sign-in screen only accepts 6 digits.
5. **Auth → Rate Limits**: with custom SMTP the email limit can go above the free default. A few per hour is plenty for personal use.

### 7. Android (Phase 3)

The package ID is **`com.ogdev.backlog`** (in `capacitor.config.ts` and `android/app/build.gradle`). It can't change once the app is installed.

**Signing keystore.** You need `keytool`, which comes with any JDK (`sudo apt install openjdk-21-jdk-headless`, or the one bundled with Android Studio).

```sh
keytool -genkeypair -v -keystore backlog-release.jks -alias backlog \
  -keyalg RSA -keysize 4096 -validity 36500 -dname "CN=<your name>"
```

- The distinguished name (`-dname`) is just a label in the certificate: nothing checks it, but anyone with the APK can read it and it can never change. A name is enough; leave out your address.

- Use the same password for the store and the key (PKCS12 keystores ignore a separate key password).
- **Back up `backlog-release.jks` and its password offline** (a password manager plus a USB stick, say). If you lose it, future updates can't install over the existing app: you'd have to uninstall it, which wipes its local data. `*.jks` is gitignored; keep it outside the repo anyway.
- Print the SHA-1 for the next step: `keytool -list -v -keystore backlog-release.jks -alias backlog`.

**Google OAuth Android client.** Native sign-in uses Android's account picker (Credential Manager). It needs the existing **web** client plus a new **Android** client, both in the same Google Cloud project.

1. Google Cloud Console → APIs & Services → Credentials → _Create OAuth client ID_ → **Android**.
2. Package name `com.ogdev.backlog`; SHA-1 from the release keystore above.
3. Nothing else changes in Supabase. The app requests an ID token for the **web** client ID, which the Google provider already accepts. Leave "Skip nonce checks" **off**.
4. Changes can take a few minutes, occasionally hours, to reach devices. `[28444] Developer console is not set up correctly` means the package name, SHA-1, or client ID doesn't match.

**GitHub configuration** (repo → Settings → Secrets and variables → Actions). Use **repository** variables and secrets, not environment ones: the workflow doesn't declare an `environment:`, so it can't see environment-scoped values.

| Kind     | Name                        | Value                                             |
| -------- | --------------------------- | ------------------------------------------------- |
| Variable | `VITE_SUPABASE_URL`         | `https://<project-ref>.supabase.co`               |
| Variable | `VITE_SUPABASE_ANON_KEY`    | the project's anon (or publishable) key           |
| Variable | `VITE_GOOGLE_WEB_CLIENT_ID` | the **web** OAuth client ID (not the Android one) |
| Secret   | `ANDROID_KEYSTORE_BASE64`   | output of `base64 -w0 backlog-release.jks`        |
| Secret   | `ANDROID_KEYSTORE_PASSWORD` | the keystore password                             |
| Secret   | `ANDROID_KEY_ALIAS`         | `backlog`                                         |
| Secret   | `ANDROID_KEY_PASSWORD`      | the same password again                           |

**Releasing.**

1. Dry run first: Actions → _Android release_ → _Run workflow_. It builds and signs the APK and attaches it to the run as an artifact, without creating a release.
2. Tag and push: `git tag v0.3.0 && git push origin v0.3.0`. The workflow attaches `backlog-v0.3.0.apk` to a new GitHub Release. Every release needs a higher version than the last one, because Android won't install a lower version code over a higher one.
3. On the phone: open the release page, download the APK, and allow your browser to install unknown apps when Android asks.

**Local builds** (optional; needs Android Studio): `pnpm android:sync` then `pnpm android:open`. A debug build is signed with your machine's debug key, so for Google sign-in in a debug build, add a second Android OAuth client with that SHA-1 (`cd android && ./gradlew signingReport`).

### Phase 1 exit check

1. Open the deployed site, sign in with Google and with an email link using an allow-listed address.
2. Try an email that isn't in `allowed_emails`: you should see "This email is not allowed to sign up for Backlog."
3. CI is green on `main`, including the RLS job.

### Phase 2 exit check

Needs the keys from step 4 set and the functions deployed.

1. Search each type (Movies, TV, Books, Games) and confirm results with covers.
2. Add one of each; they appear in the Library list.
3. Add the same item twice: the second time says "Already in your library".
4. Create a custom item and confirm it appears with a generated cover placeholder.

### Phase 3 exit check

Needs steps 6 and 7 done.

1. On the deployed site, sign in with an email code. Signing in with a link should no longer be offered.
2. A dry-run workflow run is green and produces a signed APK.
3. Tag `v0.3.0`; the release has `backlog-v0.3.0.apk` attached.
4. Install it on your phone. Sign in with Google (account picker, no browser) and with an email code; search, then add an item.
5. Sign out and back in; quit and reopen the app and you should still be signed in.

### Phase 4 exit check

No new setup: no migration and no new secrets. Deploy `main`, then tag `v0.4.0` for the APK.

1. In Library, switch between the type tabs, filter by status, and sort by title, date added and rating. Open an entry, go back, and the tab and filters are still set.
2. Open a backlog item and set it to Watching/Reading/Playing. The start date fills in with today. Mark it Completed and the finish date fills in; the start date stays as it was.
3. Go straight from Backlog to Completed: only the finish date fills in.
4. Rate with half stars (try 3.5), clear the rating, edit both dates, and write a note (it saves when you leave the field). Reload and everything is still there.
5. On a book, enter a page; the percent follows when the source gave a page count.
6. Tap **Refresh metadata** on a catalog item; tap **Remove** on a test item.
7. In Search, add something you already have. It opens the existing entry.
8. Repeat 2 and 4 in the Android app.

### Phase 5 exit check

One migration (`set_backlog_positions`): run `pnpm exec supabase db push` before deploying. No new secrets.

1. In Library, set the status to **Backlog**. The sort switches to "Backlog order" and each row has a handle.
2. Drag a few rows with the mouse. Reload, and the order is the same.
3. Switch to the **Games** tab (still on Backlog) and drag the lower game above the higher one. Back on **All**, the two games have swapped places, and everything between and around them is where it was.
4. Use the keyboard: Tab to a handle, press Space, move with the arrow keys, press Space to drop. Escape cancels.
5. Open a backlog entry: it shows "N of M in your backlog". Try **Move to top** and **Move to bottom**.
6. Change an entry's status to Backlog. It goes to the bottom.
7. On your phone, scroll the backlog by swiping over the rows (not the handles); it should scroll, not drag. Then hold a handle briefly and drag. The order should match on the web after a refresh.

### Phase 6 exit check

Redeploy the edge functions (`pnpm functions:deploy`); no migration and no new secrets. Deploy `main`, then tag `v0.6.0` for the APK.

1. Add a TV show that has **ended** and has at least two seasons (a short one helps) and open it. Progress reads "Not started" with "Up next: S1 E1".
2. Tap **Next episode** while it's in Backlog. It asks to move it to Watching; choose **Keep as Backlog** and tap again: no second prompt. Reopen the show, tap **Next episode**, and choose **Move to Watching**; the start date fills in.
3. Use **Set position** to jump to the last episode of season 1, then tap **Next episode**: it rolls over to S2 E1. Entering an episode past the end of a season is refused.
4. Set the position to one before the final episode and tap **Next episode**. "That was the last episode" appears; choose **Mark completed**. The finish date fills in.
5. Go back to the library: the show's row shows its episode, e.g. "S2 E8".
6. Open a show that's still airing (e.g. Nocturne), set it to Watching, and use **Set position** to go to the latest aired episode. **Next episode** goes away and it says when the next one airs (e.g. "S1 E4 airs Nov 12, 2026"), or "hasn't aired yet" if TMDB has no date. No Completed prompt appears.
7. After that episode airs, open the show again: it's "Up next", with no toast.
8. Repeat 2 to 4 in the Android app.

### Phase 7 exit check

One migration (`keepalive`): run `pnpm exec supabase db push` before deploying. No new secrets. Deploy `main`, then tag `v0.7.0` for the APK (it adds the Filesystem and Share plugins, so the APK must be rebuilt for export to work there).

1. Run the _Keep-alive_ workflow by hand; it prints `1`.
2. On the deployed site, open the library, then go offline (DevTools → Network → Offline, or airplane mode) and reload. The app opens, shows "Offline, read-only", and your library is there. Open an entry: every field and button is disabled. Search says it needs a connection. Go back online: the banner goes away and editing works.
3. In Chrome, install the site (address bar → _Install_). It opens in its own window with the Backlog icon.
4. After the next deploy, an open tab shows "A new version of Backlog is ready" with **Reload**.
5. Settings shows your email, the version (e.g. `v0.6.0-12-gabc1234` on the web) and the TMDB notice. **Export as JSON** downloads `backlog-export-<date>.json` with your entries and media.
6. On your phone: open the app with a connection, then turn on airplane mode, close the app fully and reopen it. The library opens read-only. (Leave it more than an hour first to check the expired-token case.)
7. Still on the phone, back online: **Export as JSON** opens the share sheet; save it to Files or Drive. Settings shows `v0.7.0`.
8. **Sign out** on the phone, then sign back in. The web stays signed in (sign-out is per device now).
