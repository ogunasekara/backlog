import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { signOut } from '@/features/auth/api'
import { useAuth } from '@/features/auth/auth-context'

export function SettingsPage() {
  const { session } = useAuth()

  return (
    <section className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold">Settings</h1>
      <p className="text-sm text-muted-foreground">
        Signed in as <span className="font-medium text-foreground">{session?.user.email}</span>
      </p>
      <div>
        <Button
          variant="outline"
          onClick={() => signOut().catch((err: Error) => toast.error(err.message))}
        >
          Sign out
        </Button>
      </div>
    </section>
  )
}
