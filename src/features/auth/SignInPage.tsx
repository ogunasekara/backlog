import { useState, type FormEvent } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { sendEmailLink, signInWithGoogle } from './api'

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
  const [sentTo, setSentTo] = useState<string | null>(null)
  const [email, setEmail] = useState('')
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

  function onSendLink(e: FormEvent) {
    e.preventDefault()
    const address = email.trim().toLowerCase()
    run(async () => {
      await sendEmailLink(address)
      setSentTo(address)
    })
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

          {sentTo === null ? (
            <form className="flex flex-col gap-3" onSubmit={onSendLink}>
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
                Email me a sign-in link
              </Button>
            </form>
          ) : (
            <div className="flex flex-col gap-3">
              <p role="status" className="text-sm">
                Check <span className="font-medium">{sentTo}</span> for a sign-in link. Open it in
                this browser to finish signing in.
              </p>
              <Button type="button" variant="ghost" onClick={() => setSentTo(null)}>
                Use a different email
              </Button>
            </div>
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
