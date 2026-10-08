import { useState, type FormEvent } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { sendEmailCode, signInWithGoogle, verifyEmailCode } from './api'

/** OAuth failures (including allow-list rejections) come back as URL params. */
function readRedirectError(): string | null {
  const params = new URLSearchParams(window.location.search)
  const hash = new URLSearchParams(window.location.hash.slice(1))
  return params.get('error_description') ?? hash.get('error_description')
}

function message(err: unknown): string {
  return err instanceof Error ? err.message : 'Something went wrong. Please try again.'
}

export function SignInPage() {
  const [step, setStep] = useState<'email' | 'code'>('email')
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(readRedirectError)

  async function run(action: () => Promise<void>) {
    setBusy(true)
    setError(null)
    try {
      await action()
    } catch (err) {
      setError(message(err))
    } finally {
      setBusy(false)
    }
  }

  function onSendCode(e: FormEvent) {
    e.preventDefault()
    run(async () => {
      await sendEmailCode(email.trim().toLowerCase())
      setStep('code')
    })
  }

  function onVerify(e: FormEvent) {
    e.preventDefault()
    run(() => verifyEmailCode(email.trim().toLowerCase(), code.trim()))
  }

  return (
    <main className="flex min-h-dvh items-center justify-center p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="text-2xl">Backlog</CardTitle>
          <CardDescription>Sign in to track your movies, shows, books, and games.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <Button variant="outline" disabled={busy} onClick={() => run(signInWithGoogle)}>
            Continue with Google
          </Button>

          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span className="h-px flex-1 bg-border" />
            or
            <span className="h-px flex-1 bg-border" />
          </div>

          {step === 'email' ? (
            <form className="flex flex-col gap-3" onSubmit={onSendCode}>
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
              <Button type="submit" disabled={busy}>
                Email me a code
              </Button>
            </form>
          ) : (
            <form className="flex flex-col gap-3" onSubmit={onVerify}>
              <Label htmlFor="code">Enter the 6-digit code sent to {email}</Label>
              <Input
                id="code"
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="[0-9]{6}"
                maxLength={6}
                required
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
              />
              <Button type="submit" disabled={busy}>
                Sign in
              </Button>
              <Button
                type="button"
                variant="ghost"
                disabled={busy}
                onClick={() => {
                  setStep('email')
                  setCode('')
                }}
              >
                Use a different email
              </Button>
            </form>
          )}

          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
        </CardContent>
      </Card>
    </main>
  )
}
