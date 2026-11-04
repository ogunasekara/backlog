function required(name: string, value: string | undefined): string {
  if (!value) throw new Error(`Missing environment variable ${name}. See .env.example.`)
  return value
}

export const env = {
  supabaseUrl: required('VITE_SUPABASE_URL', import.meta.env.VITE_SUPABASE_URL),
  supabaseAnonKey: required('VITE_SUPABASE_ANON_KEY', import.meta.env.VITE_SUPABASE_ANON_KEY),
  /** Only the Android build needs it (native Google sign-in); the web uses a redirect. */
  googleWebClientId: import.meta.env.VITE_GOOGLE_WEB_CLIENT_ID || undefined,
}
