# Self-hosting

How to run your own copy of Backlog. Every service below has a free tier that comfortably covers personal use.

You end up with:

- a **Supabase** project holding the database, auth and the two edge functions,
- the **web app** on Cloudflare, deployed on every push to `main`,
- optionally, a signed **Android APK** built by GitHub Actions whenever you push a version tag.

To run it locally while you develop, see [development.md](development.md).

## What you need

- A GitHub account, plus Node 22+ and pnpm 10 on your machine.
- Accounts with [Supabase](https://supabase.com), [Cloudflare](https://dash.cloudflare.com), [TMDB](https://www.themoviedb.org), [Twitch developers](https://dev.twitch.tv) (IGDB signs in through Twitch) and [Google Cloud](https://console.cloud.google.com).
- For email codes: a mailbox that can send over SMTP. A Gmail account with an app password works.
- For Android: a JDK (for `keytool`) to create the signing key. Android Studio is only needed for local builds.

Docker is optional. You only need it to run Supabase locally while developing.

## 1. Fork the repo

Fork it on GitHub, or clone it and push it to a repository of your own, then install dependencies:

```sh
git clone https://github.com/<you>/backlog.git
cd backlog
pnpm install
```

Before you build an APK, change the Android package ID (see [step 7](#7-android-app-optional)). Do it before the first install, because it can't change afterwards.

## 2. Create the Supabase project

1. Create a project in the [Supabase dashboard](https://supabase.com/dashboard) and note its **project ref** (the `<ref>` in `https://<ref>.supabase.co`).
2. Push the schema:
   ```sh
   pnpm exec supabase login
   pnpm exec supabase link --project-ref <project-ref>
   pnpm exec supabase db push
   ```
3. **Authentication → Hooks:** add a _Before User Created_ hook of type Postgres function, pointing at `public.hook_before_user_created`. This is what enforces the allow-list. Without it, anyone can sign up.
4. **Table editor → `allowed_emails`:** insert a row for each email that may sign in, in lowercase.
5. From **Project Settings → API**, copy the project URL and the anon (or publishable) key. Both are public by design: they ship inside the app, and row-level security protects the data.

## 3. Metadata API keys and edge functions

Search and details pages go through two edge functions, and the API keys stay on Supabase, never in the app.

| Secret                                      | Where to get it                                                                                                  |
| ------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `TMDB_KEY`                                  | [TMDB API settings](https://www.themoviedb.org/settings/api): the API Read Access Token or v3 key.               |
| `TWITCH_CLIENT_ID` / `TWITCH_CLIENT_SECRET` | Register an app in the [Twitch developer console](https://dev.twitch.tv/console/apps). Any redirect URL will do. |
| `GOOGLE_BOOKS_KEY`                          | Google Cloud Console: enable the **Books API** and create an API key. Book search doesn't work without one.      |

```sh
pnpm exec supabase secrets set TMDB_KEY=... TWITCH_CLIENT_ID=... TWITCH_CLIENT_SECRET=... GOOGLE_BOOKS_KEY=...
pnpm functions:deploy
```

If one key is missing, only that source fails, and the others still return results.

## 4. Deploy the web app to Cloudflare

1. In Cloudflare, go to **Workers & Pages → Create → Import a repository** and pick your fork.
2. Build command `pnpm build`, deploy command `npx wrangler deploy` (the default), production branch `main`.
3. Under **Settings → Build → Variables and secrets**, add these build variables. Vite bakes them into the bundle, so they must be set at build time, not runtime:
   - `VITE_SUPABASE_URL` = `https://<project-ref>.supabase.co`
   - `VITE_SUPABASE_ANON_KEY` = the anon key
   - `NODE_VERSION` = `22`
4. Deploy. The site appears at `https://backlog.<your-subdomain>.workers.dev`. To use another Worker name, change `name` in `wrangler.jsonc`.

`wrangler.jsonc` already handles client-side routes. Don't add a `_redirects` file, because Workers reject an SPA rule there.

Then, back in Supabase under **Authentication → URL Configuration**, set **Site URL** to your Cloudflare URL and add it to **Redirect URLs**, along with `http://localhost:5173` if you'll develop locally.

## 5. Email sign-in codes

The app signs people in with a 6-digit code instead of a magic link, because a link would open the website instead of the Android app. Supabase only lets you edit email templates once custom SMTP is set up.

1. **Authentication → Emails → SMTP Settings:** enable custom SMTP. For Gmail: host `smtp.gmail.com`, port `587`, your Gmail address as the username and sender, and an [app password](https://myaccount.google.com/apppasswords) as the password (it needs 2-Step Verification turned on).
2. **Authentication → Emails → Templates:** in both **Magic Link** and **Confirm signup**, paste the body of [`supabase/templates/otp.html`](../supabase/templates/otp.html). New users get the Confirm signup email and returning users get Magic Link, so both need it.
3. **Authentication → Providers → Email:** make sure it's enabled and that **Email OTP Length** is `6`.

At this point you can sign in on the web with an allow-listed email.

## 6. Google sign-in (optional)

The sign-in screen always shows **Continue with Google**. If you skip this step, that button shows an error and email codes still work.

1. In Google Cloud Console, go to **APIs & Services → Credentials → Create OAuth client ID → Web application**.
   - Authorized JavaScript origins: your Cloudflare URL (and `http://localhost:5173` for development).
   - Authorized redirect URI: `https://<project-ref>.supabase.co/auth/v1/callback`.
2. Set up the OAuth consent screen. External with Testing mode is fine; add every user as a test user.
3. In Supabase, go to **Authentication → Providers → Google**, enable it and paste the client ID and secret.

## 7. Android app (optional)

The APK is built by [`.github/workflows/android-release.yml`](../.github/workflows/android-release.yml) and installed by sideloading. Nothing goes through the Play Store.

**Change the package ID first.** `com.ogdev.backlog` belongs to the original project. Choose your own, for example `com.<you>.backlog`, and replace the old one in:

- `capacitor.config.ts` (`appId`)
- `android/app/build.gradle` (`namespace` and `applicationId`)
- `android/app/src/main/res/values/strings.xml` (`package_name` and `custom_url_scheme`)
- `android/app/src/main/java/com/ogdev/backlog/MainActivity.java`: change the `package` line and move the file to the matching directory

Once the app is installed on a phone, the ID is fixed: Android treats a new ID as a different app.

**Create a signing key** and keep it safe. If you lose it, updates won't install over the existing app.

```sh
keytool -genkeypair -v -keystore backlog-release.jks -alias backlog \
  -keyalg RSA -keysize 4096 -validity 36500 -dname "CN=<a name>"
keytool -list -v -keystore backlog-release.jks -alias backlog   # prints the SHA-1
```

Use the same password for the store and the key. Keep the `.jks` file outside the repo and back it up offline.

**Google sign-in on Android** (skip if you skipped step 6): create a second OAuth client of type **Android** in the same Google Cloud project, with your package ID and the keystore's SHA-1. Supabase needs no changes, because the app asks for an ID token issued to the web client.

**GitHub settings:** under your fork's **Settings → Secrets and variables → Actions**, add these as repository-level values, not environment ones:

| Kind     | Name                        | Value                                      |
| -------- | --------------------------- | ------------------------------------------ |
| Variable | `VITE_SUPABASE_URL`         | `https://<project-ref>.supabase.co`        |
| Variable | `VITE_SUPABASE_ANON_KEY`    | the anon key                               |
| Variable | `VITE_GOOGLE_WEB_CLIENT_ID` | the **web** OAuth client ID (optional)     |
| Secret   | `ANDROID_KEYSTORE_BASE64`   | output of `base64 -w0 backlog-release.jks` |
| Secret   | `ANDROID_KEYSTORE_PASSWORD` | the keystore password                      |
| Secret   | `ANDROID_KEY_ALIAS`         | `backlog`                                  |
| Secret   | `ANDROID_KEY_PASSWORD`      | the same password                          |

**Build a release:**

1. Dry run: **Actions → Android release → Run workflow**. It builds a signed APK and attaches it to the run.
2. Real release: `git tag v1.0.0 && git push origin v1.0.0`. The APK is attached to a new GitHub Release.
3. On the phone, download the APK from the release page and allow your browser to install unknown apps.

The version code comes from the tag (`v1.2.3` becomes `10203`), so minor and patch numbers must stay below 100 and every tag must be higher than the last.

## 8. Keep the free-tier project awake

Supabase pauses a free project after about a week without activity. [`.github/workflows/keepalive.yml`](../.github/workflows/keepalive.yml) pings it twice a week using the `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` repository variables from step 7. Add those two variables even if you skip Android, then run the workflow once by hand from the Actions tab to check it.

GitHub turns off scheduled workflows after 60 days without a commit. If that happens, re-enable it in the Actions tab.

## Updating

When you pull in new changes, deploy in this order:

1. If `supabase/migrations/` changed, run `pnpm exec supabase db push`.
2. If `supabase/functions/` changed, run `pnpm functions:deploy`.
3. Push to `main`, and Cloudflare redeploys the web app.
4. Tag a new version to rebuild the APK. A new tag is required whenever native plugins change.

## Troubleshooting

- **"This email is not allowed to sign up for Backlog":** add the address, in lowercase, to `allowed_emails`.
- **Anyone can sign up:** the Before User Created hook from step 2 isn't set.
- **Sign-in email has a link instead of a code:** update both templates in step 5.
- **Google sign-in redirects to localhost:** set the Site URL in step 4.
- **`[28444] Developer console is not set up correctly` on Android:** the package name, SHA-1 or web client ID doesn't match the Google Cloud clients. Changes there can take a while to reach devices.
- **Search says a source is "not configured":** that source's secret is missing. Set it, then run `pnpm functions:deploy` again.
