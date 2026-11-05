import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, type RenderOptions } from '@testing-library/react'
import type { ReactElement, ReactNode } from 'react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { LocationProbe } from './LocationProbe'

/** Retries off and no caching between tests, so failures surface immediately. */
function testQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0, staleTime: 0 },
      mutations: { retry: false },
    },
  })
}

type Options = Omit<RenderOptions, 'wrapper'> & {
  route?: string
  /** Route pattern the UI is mounted at, for components that read URL params. */
  path?: string
}

export function renderWithProviders(
  ui: ReactElement,
  { route = '/', path, ...options }: Options = {},
) {
  const queryClient = testQueryClient()
  const Wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[route]}>
        {path ? (
          <Routes>
            <Route path={path} element={children} />
            <Route path="*" element={null} />
          </Routes>
        ) : (
          children
        )}
        <LocationProbe />
      </MemoryRouter>
    </QueryClientProvider>
  )
  return { queryClient, ...render(ui, { wrapper: Wrapper, ...options }) }
}
