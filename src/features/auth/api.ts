import { supabase } from '@/lib/supabase'

export async function signInWithGoogle() {
  const { error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: window.location.origin },
  })
  if (error) throw error
}

/**
 * Emails a sign-in link. New users are created only if the email is allow-listed (auth hook).
 * The link must be opened in the same browser (PKCE). A 6-digit code replaces it in Phase 3.
 */
export async function sendEmailLink(email: string) {
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { shouldCreateUser: true, emailRedirectTo: window.location.origin },
  })
  if (error) throw error
}

export async function signOut() {
  const { error } = await supabase.auth.signOut()
  if (error) throw error
}
