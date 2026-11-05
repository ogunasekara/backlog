interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL?: string
  readonly VITE_SUPABASE_ANON_KEY?: string
  readonly VITE_GOOGLE_WEB_CLIENT_ID?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

/** Set at build time in vite.config.ts: the release tag or commit, and the commit. */
declare const __APP_VERSION__: string
declare const __APP_COMMIT__: string
