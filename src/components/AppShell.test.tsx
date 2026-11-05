import { onlineManager } from '@tanstack/react-query'
import { act, render, screen, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { AppShell } from './AppShell'

function renderAt(path: string) {
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route element={<AppShell />}>
          <Route path="/library" element={<p>library content</p>} />
          <Route path="/search" element={<p>search content</p>} />
        </Route>
      </Routes>
    </MemoryRouter>,
  )
}

describe('AppShell', () => {
  it('renders the sidebar and the bottom tab bar with all sections', () => {
    renderAt('/library')
    const navs = screen.getAllByRole('navigation', { name: 'Main' })
    expect(navs).toHaveLength(2)
    for (const nav of navs) {
      for (const label of ['Library', 'Search', 'Settings']) {
        expect(within(nav).getByRole('link', { name: label })).toBeInTheDocument()
      }
    }
  })

  it('renders the active route and marks its link current', () => {
    renderAt('/search')
    expect(screen.getByText('search content')).toBeInTheDocument()
    for (const link of screen.getAllByRole('link', { name: 'Search' })) {
      expect(link).toHaveAttribute('aria-current', 'page')
    }
  })

  it('says when the app is offline and read-only', () => {
    renderAt('/library')
    expect(screen.queryByText(/Offline, read-only/)).not.toBeInTheDocument()

    act(() => onlineManager.setOnline(false))
    expect(screen.getByRole('status')).toHaveTextContent(/Offline, read-only/)

    act(() => onlineManager.setOnline(true))
    expect(screen.queryByText(/Offline, read-only/)).not.toBeInTheDocument()
  })
})
