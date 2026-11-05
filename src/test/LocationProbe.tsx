import { useLocation } from 'react-router'

/** Renders the current location so tests can assert on navigation. */
export function LocationProbe() {
  const location = useLocation()
  return (
    <output data-testid="location" hidden>
      {location.pathname + location.search}
    </output>
  )
}
