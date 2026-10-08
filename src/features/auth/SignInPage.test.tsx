import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SignInPage } from './SignInPage'
import * as api from './api'

vi.mock('./api', () => ({
  signInWithGoogle: vi.fn(),
  sendEmailCode: vi.fn(),
  verifyEmailCode: vi.fn(),
}))

describe('SignInPage', () => {
  beforeEach(() => vi.clearAllMocks())

  it('sends a code, then verifies it', async () => {
    vi.mocked(api.sendEmailCode).mockResolvedValue()
    vi.mocked(api.verifyEmailCode).mockResolvedValue()
    const user = userEvent.setup()
    render(<SignInPage />)

    await user.type(screen.getByLabelText('Email'), ' Me@Example.com ')
    await user.click(screen.getByRole('button', { name: 'Email me a code' }))
    expect(api.sendEmailCode).toHaveBeenCalledWith('me@example.com')

    await user.type(await screen.findByLabelText(/6-digit code/), '12a3456')
    await user.click(screen.getByRole('button', { name: 'Sign in' }))
    expect(api.verifyEmailCode).toHaveBeenCalledWith('me@example.com', '123456')
  })

  it('shows the error when the email is rejected', async () => {
    vi.mocked(api.sendEmailCode).mockRejectedValue(
      new Error('This email is not allowed to sign up for Backlog.'),
    )
    const user = userEvent.setup()
    render(<SignInPage />)

    await user.type(screen.getByLabelText('Email'), 'stranger@example.com')
    await user.click(screen.getByRole('button', { name: 'Email me a code' }))

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
