import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SignInPage } from './SignInPage'
import * as api from './api'

vi.mock('./api', async (importOriginal) => ({
  SignInCancelledError: (await importOriginal<typeof api>()).SignInCancelledError,
  signInWithGoogle: vi.fn(),
  sendEmailCode: vi.fn(),
  verifyEmailCode: vi.fn(),
}))

describe('SignInPage', () => {
  beforeEach(() => vi.clearAllMocks())

  async function requestCode(address = ' Me@Example.com ') {
    const user = userEvent.setup()
    render(<SignInPage />)
    await user.type(screen.getByLabelText('Email'), address)
    await user.click(screen.getByRole('button', { name: 'Email me a sign-in code' }))
    return user
  }

  it('sends a code, then verifies it', async () => {
    vi.mocked(api.sendEmailCode).mockResolvedValue()
    vi.mocked(api.verifyEmailCode).mockResolvedValue()
    const user = await requestCode()

    expect(api.sendEmailCode).toHaveBeenCalledWith('me@example.com')
    expect(await screen.findByRole('status')).toHaveTextContent('me@example.com')

    const signIn = screen.getByRole('button', { name: 'Sign in' })
    expect(signIn).toBeDisabled()
    // Pasted codes sometimes carry spaces; only the digits are kept.
    await user.type(screen.getByLabelText('Code'), '123 456')
    expect(signIn).toBeEnabled()
    await user.click(signIn)

    expect(api.verifyEmailCode).toHaveBeenCalledWith('me@example.com', '123456')
  })

  it('shows the error for a wrong code and lets the user retry', async () => {
    vi.mocked(api.sendEmailCode).mockResolvedValue()
    vi.mocked(api.verifyEmailCode).mockRejectedValue(new Error('Token has expired or is invalid'))
    const user = await requestCode()

    await user.type(await screen.findByLabelText('Code'), '000000')
    await user.click(screen.getByRole('button', { name: 'Sign in' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('expired or is invalid')
    expect(screen.getByLabelText('Code')).toBeInTheDocument()
  })

  it('resends the code and can go back to change the email', async () => {
    vi.mocked(api.sendEmailCode).mockResolvedValue()
    const user = await requestCode()

    await user.click(await screen.findByRole('button', { name: 'Resend code' }))
    expect(api.sendEmailCode).toHaveBeenCalledTimes(2)

    await user.click(screen.getByRole('button', { name: 'Use a different email' }))
    expect(screen.getByLabelText('Email')).toBeInTheDocument()
  })

  it('shows the error when the email is rejected', async () => {
    vi.mocked(api.sendEmailCode).mockRejectedValue(
      new Error('This email is not allowed to sign up for Backlog.'),
    )
    await requestCode('stranger@example.com')

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

  it('stays quiet when the Google account picker is dismissed', async () => {
    vi.mocked(api.signInWithGoogle).mockRejectedValue(new api.SignInCancelledError())
    const user = userEvent.setup()
    render(<SignInPage />)
    await user.click(screen.getByRole('button', { name: 'Continue with Google' }))
    expect(api.signInWithGoogle).toHaveBeenCalled()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Continue with Google' })).toBeEnabled()
  })
})
