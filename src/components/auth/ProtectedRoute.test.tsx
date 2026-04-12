'use client'

import { render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { push, useAuth } = vi.hoisted(() => ({
  push: vi.fn(),
  useAuth: vi.fn(),
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push,
  }),
}))

vi.mock('@/contexts/AuthContext', () => ({
  useAuth,
}))

import { ProtectedRoute } from './ProtectedRoute'

describe('ProtectedRoute', () => {
  beforeEach(() => {
    push.mockReset()
    useAuth.mockReset()
  })

  it('shows a loading state while auth is resolving', () => {
    useAuth.mockReturnValue({
      user: null,
      isLoading: true,
    })

    render(
      <ProtectedRoute>
        <div>Secret content</div>
      </ProtectedRoute>,
    )

    expect(screen.getByText('Loading...')).toBeInTheDocument()
    expect(screen.queryByText('Secret content')).not.toBeInTheDocument()
  })

  it('redirects unauthenticated users to the admin login page', async () => {
    useAuth.mockReturnValue({
      user: null,
      isLoading: false,
    })

    const { container } = render(
      <ProtectedRoute>
        <div>Secret content</div>
      </ProtectedRoute>,
    )

    expect(container).toBeEmptyDOMElement()
    await waitFor(() => {
      expect(push).toHaveBeenCalledWith('/admin/login')
    })
  })

  it('renders children for authenticated users', () => {
    useAuth.mockReturnValue({
      user: { id: 'user-1' },
      isLoading: false,
    })

    render(
      <ProtectedRoute>
        <div>Secret content</div>
      </ProtectedRoute>,
    )

    expect(screen.getByText('Secret content')).toBeInTheDocument()
    expect(push).not.toHaveBeenCalled()
  })
})
