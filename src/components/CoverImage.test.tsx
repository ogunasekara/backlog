import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { CoverImage } from './CoverImage'

const COVER = 'https://cdn.example.com/cover.jpg'

function placeholder() {
  return screen.queryByText(/^[A-Z?]{1,2}$/)
}

describe('CoverImage', () => {
  it('shows the cover when a URL is given', () => {
    render(<CoverImage title="Inception" url={COVER} />)
    expect(screen.getByRole('presentation', { hidden: true })).toHaveAttribute('src', COVER)
    expect(placeholder()).not.toBeInTheDocument()
  })

  it('generates initials when there is no cover URL', () => {
    render(<CoverImage title="Breaking Bad" />)
    expect(screen.getByText('BB')).toBeInTheDocument()
  })

  it('falls back to the placeholder when the cover fails to load', () => {
    render(<CoverImage title="Inception" url={COVER} />)
    fireEvent.error(screen.getByRole('presentation', { hidden: true }))
    expect(screen.getByText('I')).toBeInTheDocument()
  })

  it('retries with a new URL after an earlier one failed', () => {
    const { rerender } = render(<CoverImage title="Inception" url={COVER} />)
    fireEvent.error(screen.getByRole('presentation', { hidden: true }))
    expect(screen.getByText('I')).toBeInTheDocument()

    rerender(<CoverImage title="Inception" url="https://cdn.example.com/other.jpg" />)
    expect(screen.getByRole('presentation', { hidden: true })).toHaveAttribute(
      'src',
      'https://cdn.example.com/other.jpg',
    )
  })

  it('strips punctuation and falls back to a question mark for an unusable title', () => {
    const { rerender } = render(<CoverImage title="¡¿—!" />)
    expect(screen.getByText('?')).toBeInTheDocument()

    rerender(<CoverImage title="The Witcher 2: Assassins of Kings" />)
    expect(screen.getByText('TW')).toBeInTheDocument()
  })

  it('gives the same title the same placeholder colour every time', () => {
    const { container: first } = render(<CoverImage title="Stable" />)
    const { container: second } = render(<CoverImage title="Stable" />)
    const style = (root: HTMLElement) => root.querySelector('div')?.getAttribute('style')
    expect(style(first)).toBe(style(second))
    expect(style(first)).toMatch(/linear-gradient/)
  })
})
