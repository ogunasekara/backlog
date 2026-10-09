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
- Sign-in emails are not really sent locally. Open Mailpit at http://127.0.0.1:54324 and click the link there.
- Edge functions (search/details) need API keys: copy `supabase/functions/.env.example` to `supabase/functions/.env`, fill it in, then run `pnpm functions:serve` in a second terminal. Without it, search returns "not configured" per source and the rest of the app still works.
- Local Google sign-in is optional. To enable it, copy `supabase/.env.example` to `supabase/.env`, fill in a Google OAuth web client, and add `http://127.0.0.1:54321/auth/v1/callback` as an authorized redirect URI on that client.

### Checks

| Command             | What it runs                                                                              |
| ------------------- | ----------------------------------------------------------------------------------------- |
| `pnpm lint`         | ESLint                                                                                    |
| `pnpm format:check` | Prettier                                                                                  |
| `pnpm typecheck`    | TypeScript                                                                                |
| `pnpm test`         | Vitest unit/component tests                                                               |
| `pnpm test:rls`     | RLS, allow-list and backlog-ordering tests against local Supabase (needs `pnpm db:start`) |

## Hosted environments (manual)

### 1. GitHub repo

```sh
gh repo create backlog --private --source . --push
```

CI (`.github/workflows/ci.yml`) runs on pushes to `main` and on PRs.

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
5. **Auth → Providers → Email**: enabled; leave "Confirm email" on or off (sign-in links work either way).
6. **Auth → Email Templates**: leave the defaults for now (editing them requires custom SMTP). Email sign-in uses the link. Switching to the 6-digit code template (`supabase/templates/otp.html`) is a Phase 3 task.
7. **Auth → URL Configuration**: Site URL = your Cloudflare URL (e.g. `https://backlog.<your-subdomain>.workers.dev`). Add `http://localhost:5173` to Redirect URLs.
8. **Auth → Providers → Google**: enable and paste the web client ID and secret from step 3 below.

> Free-tier email sending is rate limited (a few emails per hour). Configure custom SMTP under **Auth → SMTP** if that becomes a problem.

### 3. Google OAuth (web client)

1. Google Cloud Console → APIs & Services → Credentials → _Create OAuth client ID_ → **Web application**.
2. Authorized JavaScript origins: your Pages URL and `http://localhost:5173`.
3. Authorized redirect URI: `https://<project-ref>.supabase.co/auth/v1/callback`.
4. Consent screen: External, Testing mode is fine; add your Google account as a test user.

The Android client (with signing SHA-1) comes in Phase 3.

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
