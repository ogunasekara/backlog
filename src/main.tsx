import { Capacitor } from '@capacitor/core'
import { onlineManager } from '@tanstack/react-query'
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router'
import { toast } from 'sonner'
import { Toaster } from '@/components/ui/sonner'
import { AuthProvider } from '@/features/auth/AuthProvider'
import { createQueryClient, persistOptions } from '@/lib/query-client'
import App from './App.tsx'
import './index.css'

const queryClient = createQueryClient()
// TanStack assumes it starts online and only listens for changes, so an app opened
// without a connection would offer writes until the next online/offline event.
onlineManager.setOnline(navigator.onLine)

// The service worker caches the app shell so the site opens offline. The APK already
// bundles its assets, and a worker there could keep serving an old build after an update.
if (import.meta.env.PROD && !Capacitor.isNativePlatform()) {
  void import('virtual:pwa-register').then(({ registerSW }) => {
    const update = registerSW({
      // Not applied on its own: reloading could lose a note being typed.
      onNeedRefresh: () =>
        toast('A new version of Backlog is ready', {
          duration: Infinity,
          action: { label: 'Reload', onClick: () => void update(true) },
        }),
    })
  })
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <PersistQueryClientProvider client={queryClient} persistOptions={persistOptions}>
      <AuthProvider>
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </AuthProvider>
      <Toaster />
    </PersistQueryClientProvider>
  </StrictMode>,
)
