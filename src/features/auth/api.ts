import { Capacitor } from '@capacitor/core'
import { env } from '@/lib/env'
import { supabase } from '@/lib/supabase'

/** Thrown when the user backs out of the Google account picker; not worth an error message. */
export class SignInCancelledError extends Error {
  constructor() {
    super('Sign-in cancelled')
    this.name = 'SignInCancelledError'
  }
}

export async function signInWithGoogle() {
  if (Capacitor.isNativePlatform()) return signInWithGoogleNative()
  const { error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: window.location.origin },
  })
  if (error) throw error
}

async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('')
}

let socialLoginReady: Promise<typeof import('@capgo/capacitor-social-login').SocialLogin> | null =
  null

/** Loaded on demand so the web bundle never pulls in the plugin. */
function socialLogin() {
  socialLoginReady ??= (async () => {
    const webClientId = env.googleWebClientId
    if (!webClientId)
      throw new Error('Google sign-in is not configured (VITE_GOOGLE_WEB_CLIENT_ID)')
    const { SocialLogin } = await import('@capgo/capacitor-social-login')
    await SocialLogin.initialize({ google: { webClientId } })
    return SocialLogin
  })().catch((err: unknown) => {
    socialLoginReady = null
    throw err
  })
  return socialLoginReady
}

/**
 * Android: the system account picker (Credential Manager) returns a Google ID token,
 * which Supabase exchanges for a session. No redirect, so the WebView never leaves the app.
 * Google gets the hashed nonce and Supabase the raw one; Supabase hashes it to compare.
 */
async function signInWithGoogleNative() {
  const SocialLogin = await socialLogin()
  const nonce = crypto.randomUUID()

  let idToken: string | null = null
  try {
    const { result } = await SocialLogin.login({
      provider: 'google',
      // No `scopes`: the plugin then uses Credential Manager, whose ID token already carries
      // email and profile. Passing any scopes needs a MainActivity override and a different flow.
      options: { nonce: await sha256Hex(nonce) },
    })
    if ('idToken' in result) idToken = result.idToken
  } catch (err) {
    if ((err as { code?: string }).code === 'USER_CANCELLED') throw new SignInCancelledError()
    throw err
  }
  if (!idToken) throw new Error('Google did not return an ID token')

  const { error } = await supabase.auth.signInWithIdToken({
    provider: 'google',
    token: idToken,
    nonce,
  })
  if (error) throw error
}

/** Emails a 6-digit code. New users are created only if the email is allow-listed (auth hook). */
export async function sendEmailCode(email: string) {
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { shouldCreateUser: true },
  })
  if (error) throw error
}

export async function verifyEmailCode(email: string, code: string) {
  const { error } = await supabase.auth.verifyOtp({ email, token: code, type: 'email' })
  if (error) throw error
}

export async function signOut() {
  const { error } = await supabase.auth.signOut()
  if (error) throw error
}
