import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Download, LogOut } from 'lucide-react'
import type { ReactNode } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { signOut } from '@/features/auth/api'
import { useAuth } from '@/features/auth/auth-context'
import { listEntries } from '@/lib/api/entries'
import { entriesKey } from '@/lib/api/keys'
import { buildExport, saveExport } from '@/lib/export'
import { useOnline } from '@/lib/online'

export function SettingsPage() {
  const { session } = useAuth()
  const queryClient = useQueryClient()
  const online = useOnline()

  const exportData = useMutation({
    mutationFn: async () => {
      // Fresh from the server rather than the cache, so the backup is complete.
      const library = await queryClient.fetchQuery({
        queryKey: entriesKey,
        queryFn: listEntries,
        staleTime: 0,
      })
      await saveExport(buildExport(library))
      return library.length
    },
    onSuccess: (count) => toast.success(`Exported ${count} ${count === 1 ? 'item' : 'items'}`),
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : 'Could not export your data'),
  })

  const signOutMutation = useMutation({
    mutationFn: signOut,
    onError: (error) => toast.error(error instanceof Error ? error.message : 'Could not sign out'),
  })

  return (
    <section className="flex max-w-2xl flex-col gap-8">
      <h1 className="text-2xl font-semibold">Settings</h1>

      <SettingsGroup title="Account">
        <p className="text-sm text-muted-foreground">
          Signed in as <span className="font-medium text-foreground">{session?.user.email}</span>
        </p>
        <div>
          <Button
            variant="outline"
            onClick={() => signOutMutation.mutate()}
            disabled={!online || signOutMutation.isPending}
          >
            <LogOut aria-hidden />
            {signOutMutation.isPending ? 'Signing out…' : 'Sign out'}
          </Button>
        </div>
        {!online && (
          <p className="text-sm text-muted-foreground">Signing out needs a connection.</p>
        )}
      </SettingsGroup>

      <SettingsGroup title="Your data">
        <p className="text-sm text-muted-foreground">
          Download everything in your library as a JSON file: your entries with their status,
          rating, notes, dates and progress, and the details of each item.
        </p>
        <div>
          <Button
            variant="outline"
            onClick={() => exportData.mutate()}
            disabled={!online || exportData.isPending}
          >
            <Download aria-hidden />
            {exportData.isPending ? 'Exporting…' : 'Export as JSON'}
          </Button>
        </div>
        {!online && <p className="text-sm text-muted-foreground">Exporting needs a connection.</p>}
      </SettingsGroup>

      <SettingsGroup title="About">
        <p className="text-sm text-muted-foreground">
          Version <span className="font-medium text-foreground">{__APP_VERSION__}</span> (
          {__APP_COMMIT__})
        </p>
        <p className="text-sm text-muted-foreground">
          This product uses the TMDB API but is not endorsed or certified by TMDB. Game data comes
          from IGDB and book data from Google Books.
        </p>
      </SettingsGroup>
    </section>
  )
}

function SettingsGroup({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-3">
      <h2 className="text-lg font-medium">{title}</h2>
      {children}
    </div>
  )
}
