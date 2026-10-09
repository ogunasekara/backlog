import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SignInPage } from './SignInPage'
import * as api from './api'

vi.mock('./api', () => ({
  signInWithGoogle: vi.fn(),
  sendEmailLink: vi.fn(),
}))

describe('SignInPage', () => {
  beforeEach(() => vi.clearAllMocks())

  it('sends a sign-in link and tells the user to check their email', async () => {
    vi.mocked(api.sendEmailLink).mockResolvedValue()
    const user = userEvent.setup()
    render(<SignInPage />)

    await user.type(screen.getByLabelText('Email'), ' Me@Example.com ')
    await user.click(screen.getByRole('button', { name: 'Email me a sign-in link' }))

    expect(api.sendEmailLink).toHaveBeenCalledWith('me@example.com')
    expect(await screen.findByRole('status')).toHaveTextContent('me@example.com')
    expect(screen.queryByLabelText(/code/i)).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Use a different email' }))
    expect(screen.getByLabelText('Email')).toBeInTheDocument()
  })

  it('shows the error when the email is rejected', async () => {
    vi.mocked(api.sendEmailLink).mockRejectedValue(
      new Error('This email is not allowed to sign up for Backlog.'),
    )
    const user = userEvent.setup()
    render(<SignInPage />)

    await user.type(screen.getByLabelText('Email'), 'stranger@example.com')
    await user.click(screen.getByRole('button', { name: 'Email me a sign-in link' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('not allowed')
    expect(screen.getByLabelText('Email')).toBeInTheDocument()
  })

  it('starts Google sign-in', async () => {
    vi.mocked(api.signInWithGoogle).mockResolvedValue()
    const user = userEvent.setup()
    render(<SignInPage />)
    await user.click(screen.getByRole('button', { name: 'Continue with Google' }))
    expect(api.signInWithGoogle).toHaveBeenCalled()
  })
})
