import { Navigate, Route, Routes } from 'react-router'
import { AppShell } from '@/components/AppShell'
import { useAuth } from '@/features/auth/auth-context'
import { SignInPage } from '@/features/auth/SignInPage'
import { LibraryPage } from '@/features/library/LibraryPage'
import { SearchPage } from '@/features/search/SearchPage'
import { SettingsPage } from '@/features/settings/SettingsPage'

export default function App() {
  const { session, loading } = useAuth()

  if (loading) {
    return (
      <div className="flex min-h-dvh items-center justify-center text-muted-foreground">
        Loading…
      </div>
    )
  }

  if (!session) return <SignInPage />

  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route path="/library" element={<LibraryPage />} />
        <Route path="/search" element={<SearchPage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="*" element={<Navigate to="/library" replace />} />
      </Route>
    </Routes>
  )
}
