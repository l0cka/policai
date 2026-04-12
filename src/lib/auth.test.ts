/* @vitest-environment node */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const createClient = vi.fn()
const getUser = vi.fn()

vi.mock('@supabase/supabase-js', () => ({
  createClient,
}))

const originalEnv = {
  supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
  supabaseAnonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  adminPassword: process.env.ADMIN_PASSWORD,
  nodeEnv: process.env.NODE_ENV,
}

async function loadAuthModule() {
  vi.resetModules()
  return import('./auth')
}

describe('auth helpers', () => {
  beforeEach(() => {
    createClient.mockReset()
    getUser.mockReset()
    createClient.mockReturnValue({
      auth: {
        getUser,
      },
    })

    delete process.env.NEXT_PUBLIC_SUPABASE_URL
    delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    delete process.env.ADMIN_PASSWORD
    process.env.NODE_ENV = 'test'
  })

  afterEach(() => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = originalEnv.supabaseUrl
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = originalEnv.supabaseAnonKey
    process.env.ADMIN_PASSWORD = originalEnv.adminPassword
    process.env.NODE_ENV = originalEnv.nodeEnv
  })

  it('authenticates with Supabase when credentials and a session are present', async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co'
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon-key'
    getUser.mockResolvedValue({
      data: { user: { id: 'supabase-user', email: 'user@example.com' } },
      error: null,
    })

    const { verifyAuth } = await loadAuthModule()
    const request = new Request('https://example.com/api/policies', {
      headers: {
        authorization: 'Bearer token',
        cookie: 'sb-access-token=test',
      },
    })

    await expect(verifyAuth(request)).resolves.toEqual({
      id: 'supabase-user',
      email: 'user@example.com',
    })

    expect(createClient).toHaveBeenCalledWith(
      'https://example.supabase.co',
      'anon-key',
      expect.objectContaining({
        global: {
          headers: {
            Authorization: 'Bearer token',
            Cookie: 'sb-access-token=test',
          },
        },
      }),
    )
  })

  it('authenticates with the admin password header when configured', async () => {
    process.env.ADMIN_PASSWORD = 'secret'
    const { verifyAuth } = await loadAuthModule()

    const request = new Request('https://example.com/api/policies', {
      headers: {
        'x-admin-password': 'secret',
      },
    })

    await expect(verifyAuth(request)).resolves.toEqual({
      id: 'admin',
      email: 'admin@local',
    })
  })

  it('denies access when the admin password is configured but incorrect', async () => {
    process.env.ADMIN_PASSWORD = 'secret'
    const { verifyAuth } = await loadAuthModule()

    const request = new Request('https://example.com/api/policies', {
      headers: {
        'x-admin-password': 'wrong',
      },
    })

    await expect(verifyAuth(request)).resolves.toBeNull()
  })

  it('grants local access in development when no auth backend is configured', async () => {
    process.env.NODE_ENV = 'development'
    const { verifyAuth } = await loadAuthModule()

    await expect(verifyAuth(new Request('https://example.com/api/policies'))).resolves.toEqual({
      id: 'local-admin',
      email: 'admin@localhost',
    })
  })

  it('returns an unauthorized response payload', async () => {
    const { unauthorizedResponse } = await loadAuthModule()

    const response = unauthorizedResponse()

    expect(response.status).toBe(401)
    await expect(response.json()).resolves.toEqual({
      error: 'Unauthorized - Admin authentication required',
      success: false,
    })
  })
})
